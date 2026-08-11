/**
 * Procedural material textures for the texture array. Vertices address a
 * material through the `tex` field (materialId, u, v, 0); layer `materialId - 1`
 * of the array holds its texture. These deterministic placeholder patterns stand
 * in for cache-decoded game textures (a later stage); the sampling pipeline —
 * array texture, Q12 UVs, per-vertex layer index — is the real one.
 */

/** Texture edge length in texels; every layer is square RGBA8. */
export const TEXTURE_SIZE = 64;

/** Number of material layers (materials 1..MATERIAL_COUNT). */
export const MATERIAL_COUNT = 3;

/** Builds all layers as one contiguous RGBA8 buffer, layer-major. */
export function buildTextureLayers(): Uint8Array {
	const bytesPerLayer = TEXTURE_SIZE * TEXTURE_SIZE * 4;
	const data = new Uint8Array(bytesPerLayer * MATERIAL_COUNT);
	fillChecker(data.subarray(0, bytesPerLayer));
	fillBrick(data.subarray(bytesPerLayer, 2 * bytesPerLayer));
	fillNoise(data.subarray(2 * bytesPerLayer, 3 * bytesPerLayer));
	return data;
}

/** Material 1: a light/dark checkerboard (8x8 texel squares). */
function fillChecker(out: Uint8Array): void {
	for (let y = 0; y < TEXTURE_SIZE; y++) {
		for (let x = 0; x < TEXTURE_SIZE; x++) {
			const light = ((x >> 3) ^ (y >> 3)) & 1;
			const value = light ? 200 : 110;
			put(out, x, y, value, value, value);
		}
	}
}

/** Material 2: staggered bricks with mortar lines. */
function fillBrick(out: Uint8Array): void {
	const brickH = 16;
	const brickW = 32;
	for (let y = 0; y < TEXTURE_SIZE; y++) {
		const row = Math.floor(y / brickH);
		const shift = (row & 1) * (brickW >> 1);
		for (let x = 0; x < TEXTURE_SIZE; x++) {
			const bx = (x + shift) % brickW;
			const mortar = y % brickH < 2 || bx < 2;
			if (mortar) {
				put(out, x, y, 150, 140, 130);
			} else {
				const shade = 20 * (((x + shift) / brickW) & 1);
				put(out, x, y, 168 - shade, 84 - shade, 60 - shade);
			}
		}
	}
}

/** Material 3: hash-noise stone. Deterministic (no Math.random). */
function fillNoise(out: Uint8Array): void {
	for (let y = 0; y < TEXTURE_SIZE; y++) {
		for (let x = 0; x < TEXTURE_SIZE; x++) {
			const n = hash2(x, y);
			const value = 100 + (n % 80);
			put(out, x, y, value, value, value + 12);
		}
	}
}

function put(out: Uint8Array, x: number, y: number, r: number, g: number, b: number): void {
	const at = (y * TEXTURE_SIZE + x) * 4;
	out[at] = r;
	out[at + 1] = g;
	out[at + 2] = b;
	out[at + 3] = 255;
}

function hash2(x: number, y: number): number {
	let h = (x * 374_761_393 + y * 668_265_263) | 0;
	h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
	return (h ^ (h >>> 16)) >>> 0;
}
