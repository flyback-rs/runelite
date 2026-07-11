// A minimal harness page that loads the WasmGC module and exposes its network
// probe exports to Playwright. It drives the *real* Java WebSocketDuplexStream
// transport (worker-less, on the page) so an E2E can prove a byte round-trip
// through the gateway without standing up the full game protocol.

interface NetExports {
	netProbeStart(gatewayUrl: string, host: string, port: number, message: string): void;
	netProbeResult(): string;
}
interface TeaVMModule {
	readonly exports: Record<string, unknown>;
}
interface TeaVMApi {
	readonly wasmGC: { load(path: string): Promise<TeaVMModule> };
}

declare global {
	interface Window {
		__netprobe?: {
			ready: boolean;
			error: string | null;
			start(gatewayUrl: string, host: string, port: number, message: string): void;
			result(): string;
		};
	}
}

const RUNTIME_URL = "./runelite-browser.wasm-runtime.js";
const WASM_URL = "./runelite-browser.wasm";

async function loadTeaVM(url: string): Promise<TeaVMApi> {
	const module = (await import(/* @vite-ignore */ url)) as { default?: TeaVMApi };
	const teavm = module.default ?? (globalThis as { TeaVM?: TeaVMApi }).TeaVM;
	if (!teavm) {
		throw new Error("TeaVM runtime did not export its API");
	}
	return teavm;
}

async function boot(): Promise<void> {
	window.__netprobe = {
		ready: false,
		error: null,
		start: () => undefined,
		result: () => "idle",
	};
	try {
		const teavm = await loadTeaVM(RUNTIME_URL);
		const module = await teavm.wasmGC.load(WASM_URL);
		const exports = module.exports as unknown as NetExports;
		window.__netprobe.start = (gatewayUrl, host, port, message) =>
			exports.netProbeStart(gatewayUrl, host, port, message);
		window.__netprobe.result = () => exports.netProbeResult();
		window.__netprobe.ready = true;
	} catch (error) {
		window.__netprobe.error = error instanceof Error ? error.message : String(error);
	}
}

void boot();

/** The probe control surface installed on `window`; exported so this file is a module. */
export type NetProbeWindow = NonNullable<Window["__netprobe"]>;
