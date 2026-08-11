import type { GameIn, GameOut } from "../protocol.ts";
import { Ring, type RingLayout } from "../transport/ring.ts";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const TARGET_FRAME_MS = 1000 / 60;

/** The @JSExport surface of the WasmGC module (see Java WasmEntry). */
interface GameExports {
	gameInit(width: number, height: number): void;
	gameResize(width: number, height: number): void;
	gameFrameCapacity(): number;
	gameProduceFrame(target: Int8Array, frameIndex: number): number;
}
interface TeaVMModule {
	readonly exports: Record<string, unknown>;
}
interface TeaVMApi {
	readonly wasmGC: { load(path: string): Promise<TeaVMModule> };
}

let ring: Ring | null = null;
let game: GameExports | null = null;
let frameIndex = 0;
let running = false;
let errorCount = 0;

function post(message: GameOut): void {
	ctx.postMessage(message);
}

ctx.addEventListener("message", (event: MessageEvent<GameIn>) => {
	const message = event.data;
	if (message.type === "init") {
		void start(message);
	} else if (message.type === "resize" && game) {
		game.gameResize(message.width, message.height);
	}
	// pointer/key/wheel are forwarded for the input transport; the synthetic
	// scene source ignores them (the real client will consume them).
});

/**
 * Loads the TeaVM WasmGC runtime. `build.mjs` appends an ESM default export to
 * the copied runtime, so it can be imported directly (no `new Function`, which a
 * Content-Security-Policy would forbid).
 */
async function loadTeaVM(runtimeUrl: string): Promise<TeaVMApi> {
	const module = (await import(/* @vite-ignore */ runtimeUrl)) as { default?: TeaVMApi };
	const teavm = module.default ?? (globalThis as { TeaVM?: TeaVMApi }).TeaVM;
	if (!teavm) {
		throw new Error("TeaVM runtime did not export its API");
	}
	return teavm;
}

async function start(message: Extract<GameIn, { type: "init" }>): Promise<void> {
	try {
		ring = Ring.attach(message.ring satisfies RingLayout);
		const teavm = await loadTeaVM(message.runtimeUrl);
		const module = await teavm.wasmGC.load(message.wasmUrl);
		game = module.exports as unknown as GameExports;
		game.gameInit(message.width, message.height);
		running = true;
		post({ type: "ready" });
		loop();
	} catch (error) {
		post({ type: "error", message: error instanceof Error ? error.message : String(error) });
	}
}

function loop(): void {
	if (!running || !ring || !game) {
		return;
	}
	const began = performance.now();
	try {
		const { payload } = ring.acquireWrite();
		// A signed view over the same shared bytes for the Java Int8Array parameter.
		const target = new Int8Array(payload.buffer, payload.byteOffset, payload.byteLength);
		const length = game.gameProduceFrame(target, frameIndex);
		ring.commit(length);
		frameIndex++;
	} catch (error) {
		// Report but keep producing: one bad frame must not kill the game loop.
		errorCount++;
		post({ type: "error", message: `frame ${frameIndex} (${errorCount}): ${describe(error)}` });
	}
	setTimeout(loop, Math.max(0, TARGET_FRAME_MS - (performance.now() - began)));
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
