import type { BackendPreference } from "./backends/create.ts";
import type { RingLayout } from "./transport/ring.ts";

// Main thread -> render worker.
export interface RenderInit {
	readonly type: "init";
	readonly canvas: OffscreenCanvas;
	readonly ring: RingLayout;
	readonly width: number;
	readonly height: number;
	readonly backend: BackendPreference;
}
export interface RenderResize {
	readonly type: "resize";
	readonly width: number;
	readonly height: number;
}
/**
 * The client UI pixel layer (RGBA8, row-major from the top), composited over
 * the 3D scene. The buffer is transferred, not copied. This is the seam the
 * CheerpJ-hosted client's `BufferProvider.getPixels()` frames arrive through.
 */
export interface RenderUi {
	readonly type: "ui";
	readonly width: number;
	readonly height: number;
	readonly pixels: ArrayBuffer;
}
export type RenderIn = RenderInit | RenderResize | RenderUi;

// Render worker -> main thread.
export interface RenderReady {
	readonly type: "ready";
	readonly backend: string;
}
export interface RenderStats {
	readonly type: "stats";
	readonly frameCount: number;
	readonly medianMs: number;
	readonly sample: number[] | null;
	/** Draw batches in the last frame. */
	readonly batchCount: number;
	/** Glyphs (characters) in the last frame's glyph runs. */
	readonly glyphCount: number;
	/** Whether the font atlas baked successfully. */
	readonly glyphAtlas: boolean;
	/** Whether a UI layer has been composited. */
	readonly uiLayer: boolean;
}
export interface RenderError {
	readonly type: "error";
	readonly message: string;
}
export type RenderOut = RenderReady | RenderStats | RenderError;

// Main thread -> game worker.
export interface GameInit {
	readonly type: "init";
	readonly ring: RingLayout;
	readonly runtimeUrl: string;
	readonly wasmUrl: string;
	readonly width: number;
	readonly height: number;
}
// Input events forwarded from the shell. The synthetic scene source ignores them
// for now; they establish the input transport the real client will consume.
export interface GamePointer {
	readonly type: "pointer";
	readonly x: number;
	readonly y: number;
	readonly buttons: number;
}
export interface GameKey {
	readonly type: "key";
	readonly code: string;
	readonly down: boolean;
}
export interface GameWheel {
	readonly type: "wheel";
	readonly dy: number;
}
export interface GameResize {
	readonly type: "resize";
	readonly width: number;
	readonly height: number;
}
export type GameIn = GameInit | GamePointer | GameKey | GameWheel | GameResize;

// Game worker -> main thread.
export interface GameReady {
	readonly type: "ready";
}
export interface GameError {
	readonly type: "error";
	readonly message: string;
}
export type GameOut = GameReady | GameError;
