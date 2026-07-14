// Boots the real Old School RuneScape client under CheerpJ.
//
// Flow: fetch lib/config.json (written by fetch-assets.mjs) -> cheerpjInit
// (Java 8 for the vanilla applet, Java 11 for RuneLite's injected client) ->
// create the AWT display -> load lib/cheerpj-boot.jar with cheerpjRunLibrary -> call
// BrowserBoot.bootVanilla (the unmodified gamepack as an applet) or
// BrowserBoot.bootInjected (RuneLite's injected client) with the jav_config
// parameters. See ../../../docs/cheerpj-integration.md.
//
// Networking: the client opens raw TCP sockets to <world>:43594 (JS5 + game).
// The default transport is the project's own gateway — a custom java.net.Socket
// implementation (WsSocketImpl) relays bytes over a WebSocket to
// runelite-browser-gateway (local Node, or a Cloudflare Worker). Point it with
// ?gateway=ws://host:port (default ws://<page-host>:8090), or ?gateway=none to
// fall back to CheerpJ's built-in Tailscale transport (?tsKey=/?ts=interactive).
// Without any working transport the client boots to its loading screen and then
// reports a JS5 connection error — that still proves the whole render path.
//
// Status is published on window.__cheerpj for a headless driver.

/* global cheerpjInit, cheerpjRunLibrary, cheerpjCreateDisplay */

const status = {
	phase: "loading",
	runtimeReady: false,
	booted: false,
	result: null,
	error: null,
	tailscaleIp: null,
};
window.__cheerpj = status;

const els = {
	overlay: document.getElementById("loading"),
	stage: document.getElementById("stage"),
	detail: document.getElementById("detail"),
	elapsed: document.getElementById("elapsed"),
	log: document.getElementById("log"),
};

// Friendly one-liners for the on-screen loading stage. Raw phase names still go
// to the debug log and window.__cheerpj.
const STAGE_TEXT = {
	"cheerpjInit": ["Starting the Java runtime…", "First load downloads the runtime (~30–90s). It is cached for next time."],
	"runtime ready": ["Java runtime ready", ""],
	"cheerpjRunLibrary": ["Loading client support classes…", "First load downloads the JDK (AWT, reflection). Cached afterwards."],
	"loading-jar": ["Loading the game client…", ""],
	"instantiating": ["Starting the game client…", ""],
	"applet-init": ["Initialising the client…", ""],
	"initializing": ["Initialising the client…", ""],
	"started": ["Client running", "Connecting to the game world…"],
};

function stage(name) {
	const [title, detail] = STAGE_TEXT[name] ?? [name, els.detail ? els.detail.textContent : ""];
	if (els.stage) els.stage.textContent = title;
	if (els.detail && detail !== undefined) els.detail.textContent = detail;
}

function log(message) {
	status.phase = message;
	stage(message.replace(/…\s*\d+s$/, "")); // strip heartbeat suffix for the stage map
	if (els.log) {
		els.log.textContent += message + "\n";
		els.log.scrollTop = els.log.scrollHeight;
	}
	console.log("[boot]", message);
}

let bootStarted = Date.now();
setInterval(() => {
	if (els.elapsed && !status.booted && !status.error) {
		els.elapsed.textContent = Math.round((Date.now() - bootStarted) / 1000) + "s";
	}
}, 250);

function finishOverlay(kind) {
	if (!els.overlay) return;
	if (kind === "error") {
		els.overlay.classList.add("error");
		if (els.stage) els.stage.textContent = "Boot failed";
		if (els.detail) els.detail.textContent = status.error ?? "";
	} else {
		els.overlay.classList.add("hidden");
	}
}

// Updates the on-screen stage every 5s while `promise` is pending, so a slow
// first-load download is visibly distinguishable from a genuine hang.
async function heartbeat(label, promise) {
	const started = Date.now();
	stage(label);
	const timer = setInterval(() => {
		console.log(`[boot] ${label}… ${Math.round((Date.now() - started) / 1000)}s`);
	}, 5000);
	try {
		return await promise;
	} finally {
		clearInterval(timer);
	}
}

async function loadConfig() {
	const response = await fetch("./lib/config.json");
	if (!response.ok) {
		throw new Error("lib/config.json missing — run `node fetch-assets.mjs` first");
	}
	return response.json();
}

function bootMode(query) {
	return query.get("mode") === "injected" ? "injected" : "vanilla";
}

// CheerpJ runtime version: the vanilla gamepack is applet-era Java 8; RuneLite's
// injected client is Java 11 bytecode. Override with ?jver=N.
function javaVersion(query) {
	return Number(query.get("jver")) || (bootMode(query) === "injected" ? 11 : 8);
}

// The gateway base URL, or "" to use CheerpJ's Tailscale transport instead.
function gatewayUrl(query) {
	const value = query.get("gateway");
	if (value === "none") {
		return "";
	}
	return value ?? `ws://${location.hostname}:8090`;
}

function initOptions(query) {
	const options = {
		version: javaVersion(query),
		// We render our own loading overlay, so CheerpJ's status reporting is off
		// by default; ?status=default|splash re-enables CheerpJ's for debugging.
		status: query.get("status") ?? "none",
		javaProperties: ["user.home=/files", "jagex.disableBouncyCastle=true"],
		// Socket relay natives (WsBridge): active only once installGateway() runs.
		natives: window.__socketNatives,
	};
	if (query.get("debug") === "1") {
		options.enableDebug = true;
	}
	// Tailscale is the fallback transport when ?gateway=none.
	if (!gatewayUrl(query)) {
		options.tailscaleIpCb = (ip) => {
			status.tailscaleIp = ip;
			log("tailscale ip: " + ip);
		};
		const tsKey = query.get("tsKey");
		if (tsKey) {
			options.tailscaleAuthKey = tsKey;
		} else if (query.get("ts") === "interactive") {
			options.tailscaleLoginUrlCb = (url) => {
				log("tailscale login required: " + url);
				window.open(url, "_blank");
			};
		}
	}
	return options;
}

async function boot() {
	try {
		const query = new URLSearchParams(location.search);
		const config = await loadConfig();

		// ?world=N retargets the codebase (and so the game socket) at a world.
		let codebase = config.codebase;
		const world = query.get("world");
		if (world) {
			codebase = codebase.replace(/oldschool\d*\./, `oldschool${world}.`);
		}
		const width = Number(query.get("width") ?? config.width);
		const height = Number(query.get("height") ?? config.height);
		const params = Object.entries(config.params)
			.map(([key, value]) => `${key}\t${value}`)
			.join("\n");

		log(`cheerpjInit (java ${javaVersion(query)})…`);
		await heartbeat("cheerpjInit", cheerpjInit(initOptions(query)));
		status.runtimeReady = true;
		log("runtime ready");

		cheerpjCreateDisplay(-1, -1, document.getElementById("display"));

		log("loading boot shim…");
		const lib = await heartbeat("cheerpjRunLibrary", cheerpjRunLibrary("/app/lib/cheerpj-boot.jar"));
		const BrowserBoot = await lib.net.runelite.browser.cheerpj.BrowserBoot;

		// Route java.net.Socket through the gateway (unless ?gateway=none).
		const gateway = gatewayUrl(query);
		if (gateway) {
			log("networking via gateway: " + gateway);
			await BrowserBoot.installGateway(gateway);
		} else {
			log("networking via CheerpJ Tailscale");
		}

		// Surface the shim's progress while the client starts up.
		const poll = setInterval(async () => {
			try {
				const phase = await BrowserBoot.phase();
				if (phase !== status.phase) {
					log(phase);
				}
			} catch {
				clearInterval(poll);
			}
		}, 2000);

		const mode = bootMode(query);
		log(`booting ${mode} client ${width}x${height} from ${codebase}`);
		const result =
			mode === "injected"
				? await BrowserBoot.bootInjected(
						"/app/lib/injected-client.jar",
						"/app/lib/runelite-api.jar",
						codebase,
						params,
						width,
						height,
					)
				: await BrowserBoot.bootVanilla("/app/lib/gamepack.jar", codebase, params, width, height);
		clearInterval(poll);
		status.result = result;
		status.booted = result === "ok";
		log("boot result: " + result);
		if (status.booted) {
			// The applet has started; reveal the client (it shows its own loading
			// bar / login while it downloads the cache over the gateway).
			finishOverlay("hidden");
		} else {
			status.error = result;
			finishOverlay("error");
		}
	} catch (error) {
		status.error = error instanceof Error ? error.message : String(error);
		log("error: " + status.error);
		finishOverlay("error");
	}
}

// The debug log is hidden by default; ?log=1 or the backtick key reveals it.
if (new URLSearchParams(location.search).get("log") === "1") {
	els.log?.classList.remove("hidden");
}
window.addEventListener("keydown", (event) => {
	if (event.key === "`") {
		els.log?.classList.toggle("hidden");
	}
});

void boot();
