// Boots the real Old School RuneScape client under CheerpJ.
//
// Flow: fetch lib/config.json (written by fetch-assets.mjs) -> cheerpjInit
// (Java 8; applets are supported on the Java 8 runtime only) -> create the AWT
// display -> load lib/cheerpj-boot.jar with cheerpjRunLibrary -> call
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

function log(message) {
	status.phase = message;
	const el = document.getElementById("log");
	if (el) {
		el.textContent += message + "\n";
	}
	console.log("[boot]", message);
}

// Logs elapsed seconds every 5s while `promise` is pending, so a slow runtime
// download is visibly distinguishable from a genuine hang.
async function heartbeat(label, promise) {
	const started = Date.now();
	const timer = setInterval(() => log(`${label}… ${Math.round((Date.now() - started) / 1000)}s`), 5000);
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
		version: 8,
		// ?status=none removes CheerpJ's loading overlay (useful to see what is
		// actually rendered underneath); default "default" shows progress text.
		status: query.get("status") ?? "default",
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

		log("cheerpjInit (java 8)…");
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

		const mode = query.get("mode") === "injected" ? "injected" : "vanilla";
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
	} catch (error) {
		status.error = error instanceof Error ? error.message : String(error);
		log("error: " + status.error);
	}
}

void boot();
