// CheerpJ boot spike for the real Old School RuneScape client.
//
// This is an R&D harness, not shipped code. It loads CheerpJ (a full JVM in
// WebAssembly) and boots the unmodified client, chosen because the obfuscated
// gamepack cannot be compiled to WasmGC by TeaVM (its obfuscator emits
// invokedynamic forms TeaVM 0.11 cannot parse). CheerpJ runs the bytecode as-is,
// including AWT/Swing, reflection, threads and invokedynamic.
//
// Status is published on `window.__cheerpj` so a headless driver can observe how
// far the boot progresses. See ../../../docs/cheerpj-integration.md for the full
// analysis (pixel/interop hand-off, networking, licensing).

/* global cheerpjInit, cheerpjRunLibrary */

const status = {
	phase: "loading",
	runtimeReady: false,
	clientClass: false,
	instantiated: false,
	error: null,
};
window.__cheerpj = status;

function log(message) {
	status.phase = message;
	const el = document.getElementById("log");
	if (el) {
		el.textContent += message + "\n";
	}
}

// The jav_config.ws parameters the applet reads via getParameter(). A real
// deployment fills these from the live config; the query string can override the
// world for local experimentation.
function appletParameters() {
	const q = new URLSearchParams(location.search);
	return {
		colourid: "0",
		worldid: q.get("world") ?? "1",
		lobbyid: "0",
		lobbyaddress: "",
		demoid: "0",
		demoaddress: "",
	};
}

// The client classpath. By default the RuneLite pre-injected client placed in
// lib/ (see README); a real deployment can instead point at the vanilla gamepack
// fetched from the world codebase.
function classpath() {
	const q = new URLSearchParams(location.search);
	const override = q.get("classpath");
	if (override) {
		return override;
	}
	return "/app/lib/injected-client.jar:/app/lib/runelite-api.jar";
}

async function boot() {
	try {
		log("cheerpjInit…");
		// Java 8 runtime (the vanilla client targets an applet-era JDK). Networking
		// is left at CheerpJ's default here; the docs describe routing it through
		// the project's WSS↔TCP gateway instead.
		await cheerpjInit({ version: 8, status: "splash" });
		status.runtimeReady = true;
		log("runtime ready");

		const cp = classpath();
		log("loading classpath: " + cp);
		const lib = await cheerpjRunLibrary(cp);

		// The client's top class extends java.applet.Applet through its obfuscated
		// chain and implements net.runelite.api.Client.
		const ClientClass = await lib.client;
		status.clientClass = true;
		log("client class resolved");

		const applet = await new ClientClass();
		status.instantiated = true;
		log("client applet instantiated");

		// Applet lifecycle (setStub/init/start) plus the AppletStub that returns
		// appletParameters() is deployment-specific and needs a live game socket to
		// progress past init; see the integration doc. Kept explicit here so the
		// hand-off point is obvious.
		void applet;
		void appletParameters;
		log("boot spike reached applet instantiation");
	} catch (error) {
		status.error = error instanceof Error ? error.message : String(error);
		log("error: " + status.error);
	}
}

void boot();
