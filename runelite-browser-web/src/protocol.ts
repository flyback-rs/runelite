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
export type RenderIn = RenderInit | RenderResize;

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
