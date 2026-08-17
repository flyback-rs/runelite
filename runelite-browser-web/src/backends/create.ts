import type { Backend } from "./types.ts";
import { Gl2Backend } from "./webgl2.ts";
import { GpuBackend } from "./webgpu.ts";

export type BackendPreference = "auto" | "webgpu" | "webgl2";

/**
 * Creates a renderer backend. WebGPU is preferred when available and WebGL2 is
 * the fallback. A WebGPU adapter is requested before the canvas is bound to any
 * context, so a clean fallback to WebGL2 on the same canvas stays possible.
 */
export async function createBackend(
	canvas: OffscreenCanvas,
	width: number,
	height: number,
	preference: BackendPreference = "auto",
): Promise<Backend> {
	if (preference !== "webgl2") {
		try {
			const gpu = await GpuBackend.create(canvas, width, height);
			if (gpu) {
				return gpu;
			}
			if (preference === "webgpu") {
				throw new Error("WebGPU requested but no adapter/device is available");
			}
		} catch (error) {
			if (preference === "webgpu") {
				throw error;
			}
			console.warn("[render] WebGPU unavailable, falling back to WebGL2:", error);
		}
	}
	return new Gl2Backend(canvas, width, height);
}
