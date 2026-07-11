import type { GameIn, GameOut } from "../protocol.ts";
import { Ring, type RingLayout } from "../transport/ring.ts";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const TARGET_FRAME_MS = 1000 / 60;

/** The @JSExport surface of the WasmGC module (see Java WasmEntry). */
interface GameExports {
	gameInit(width: number, height: number): void;
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

function post(message: GameOut): void {
	ctx.postMessage(message);
}

ctx.addEventListener("message", (event: MessageEvent<GameIn>) => {
	const message = event.data;
	if (message.type === "init") {
		void start(message);
	}
});

/**
 * Loads the TeaVM WasmGC runtime. The generated runtime is a classic IIFE that
 * assigns a global `TeaVM`; a module worker cannot `importScripts`, so it is
 * evaluated in a function scope and its `TeaVM` returned. The source is our own
 * build artifact served same-origin.
 */
async function loadTeaVM(runtimeUrl: string): Promise<TeaVMApi> {
	const response = await fetch(runtimeUrl);
	const code = await response.text();
	// oxlint-disable-next-line no-new-func
	const factory = new Function(`${code}\nreturn TeaVM;`) as () => TeaVMApi;
	return factory();
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
	const { payload } = ring.acquireWrite();
	// A signed view over the same shared bytes for the Java Int8Array parameter.
	const target = new Int8Array(payload.buffer, payload.byteOffset, payload.byteLength);
	const length = game.gameProduceFrame(target, frameIndex);
	ring.commit(length);
	frameIndex++;
	setTimeout(loop, Math.max(0, TARGET_FRAME_MS - (performance.now() - began)));
}
