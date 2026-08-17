import { type BackendPreference, createBackend } from "../backends/create.ts";
import type { Backend } from "../backends/types.ts";
import type { RenderIn, RenderOut } from "../protocol.ts";
import { type Frame, parseFrame } from "../scene/command-buffer.ts";
import { Ring, type RingLayout } from "../transport/ring.ts";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const STATS_INTERVAL_MS = 500;
const TARGET_FRAME_MS = 1000 / 60;

let backend: Backend | null = null;
let ring: Ring | null = null;
let canvas: OffscreenCanvas | null = null;
let lastFrame: Frame | null = null;
let frameCount = 0;
let lastStatsAt = 0;
const frameTimes: number[] = [];

function post(message: RenderOut): void {
	ctx.postMessage(message);
}

ctx.addEventListener("message", (event: MessageEvent<RenderIn>) => {
	const message = event.data;
	if (message.type === "init") {
		void init(message.canvas, message.width, message.height, message.backend, message.ring);
	} else if (message.type === "resize" && backend && canvas) {
		canvas.width = message.width;
		canvas.height = message.height;
		backend.resize(message.width, message.height);
	}
});

async function init(
	offscreen: OffscreenCanvas,
	width: number,
	height: number,
	preference: BackendPreference,
	ringLayout: RingLayout,
): Promise<void> {
	try {
		canvas = offscreen;
		canvas.width = width;
		canvas.height = height;
		ring = Ring.attach(ringLayout);
		backend = await createBackend(canvas, width, height, preference);
		post({ type: "ready", backend: backend.name });
		loop();
	} catch (error) {
		post({ type: "error", message: describe(error) });
	}
}

function loop(): void {
	const start = performance.now();
	try {
		if (ring && backend) {
			const latest = ring.readLatest();
			if (latest) {
				lastFrame = parseFrame(latest.data, latest.length);
			}
			if (lastFrame) {
				backend.render(lastFrame);
				frameCount++;
			}
		}
	} catch (error) {
		post({ type: "error", message: describe(error) });
		return;
	}

	const elapsed = performance.now() - start;
	frameTimes.push(elapsed);
	if (frameTimes.length > 120) {
		frameTimes.shift();
	}

	const now = performance.now();
	if (now - lastStatsAt > STATS_INTERVAL_MS) {
		lastStatsAt = now;
		const sample = backend?.sampleCenter?.() ?? null;
		post({
			type: "stats",
			frameCount,
			medianMs: median(frameTimes),
			sample: sample ? [...sample] : null,
		});
	}

	setTimeout(loop, Math.max(0, TARGET_FRAME_MS - elapsed));
}

function median(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = values.toSorted((a, b) => a - b);
	return sorted[sorted.length >> 1] ?? 0;
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
