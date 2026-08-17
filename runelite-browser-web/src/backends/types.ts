import type { Frame } from "../scene/command-buffer.ts";

/** A GPU backend that renders parsed frames to an OffscreenCanvas. */
export interface Backend {
	readonly name: "webgpu" | "webgl2";
	/** Updates the drawing-buffer size (canvas already resized by the caller). */
	resize(width: number, height: number): void;
	/** Renders one frame. */
	render(frame: Frame): void;
	/**
	 * Reads back the centre pixel (RGBA8) if the backend supports a synchronous
	 * read, else null. Used for verification.
	 */
	sampleCenter?(): Uint8Array | null;
	dispose(): void;
}

/** Clear colour for the scene (linear-ish sRGB), a dark slate. */
export const CLEAR_COLOR: readonly [number, number, number, number] = [0.06, 0.07, 0.09, 1];

/** Unpacks a packed RGBA8 colour `(r<<24)|(g<<16)|(b<<8)|a` to 0..1 floats. */
export function unpackRgba(color: number): [number, number, number, number] {
	return [
		((color >>> 24) & 0xff) / 255,
		((color >>> 16) & 0xff) / 255,
		((color >>> 8) & 0xff) / 255,
		(color & 0xff) / 255,
	];
}
