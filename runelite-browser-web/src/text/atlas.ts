/**
 * Glyph atlas for `GLYPH_RUNS`. At render-worker startup the three RuneScape
 * TTFs bundled with the client are loaded via `FontFace` and the printable ASCII
 * range is rasterised once into a single RGBA atlas with an OffscreenCanvas 2D
 * context. Text then renders as textured quads; per-run colour tints the white
 * glyph coverage. If fonts are unavailable (offline, or no FontFaceSet in the
 * worker), the atlas is null and text is skipped rather than failing the frame.
 */

export const FONT_FILES = [
	{ family: "RuneScapeSmall", file: "runescape_small.ttf" },
	{ family: "RuneScapeRegular", file: "runescape.ttf" },
	{ family: "RuneScapeBold", file: "runescape_bold.ttf" },
] as const;

/** The classic point size the client renders these fonts at. */
const FONT_PX = 16;

const FIRST_CHAR = 32;
const LAST_CHAR = 126;
const PADDING = 1;

export interface Glyph {
	/** Atlas rect in texels. */
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	/** Placement offsets from the pen position (baseline-left). */
	readonly ox: number;
	readonly oy: number;
	readonly advance: number;
}

export interface GlyphAtlas {
	readonly size: number;
	/** RGBA8, white glyphs on transparent. */
	readonly pixels: Uint8Array;
	/** Per font id, glyphs indexed by `charCode - 32`. */
	readonly fonts: readonly (readonly Glyph[])[];
}

interface WorkerFonts {
	readonly fonts?: FontFaceSet;
}

/**
 * Builds the atlas, or returns null when the worker cannot rasterise fonts.
 *
 * @param baseUrl base URL the font files are served under (e.g. `./fonts/`)
 */
export async function buildGlyphAtlas(baseUrl: string): Promise<GlyphAtlas | null> {
	const fontSet = (self as WorkerFonts).fonts;
	if (!fontSet || typeof OffscreenCanvas === "undefined") {
		return null;
	}
	try {
		await Promise.all(
			FONT_FILES.map(async ({ family, file }) => {
				const response = await fetch(new URL(file, baseUrl));
				if (!response.ok) {
					throw new Error(`font ${file}: HTTP ${response.status}`);
				}
				const face = new FontFace(family, await response.arrayBuffer());
				await face.load();
				fontSet.add(face);
			}),
		);
		return rasterise();
	} catch (error) {
		console.warn("[render] glyph atlas unavailable:", error);
		return null;
	}
}

function rasterise(): GlyphAtlas {
	const size = 512;
	const canvas = new OffscreenCanvas(size, size);
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) {
		throw new Error("no 2d context");
	}
	ctx.clearRect(0, 0, size, size);
	ctx.fillStyle = "#ffffff";
	ctx.textBaseline = "alphabetic";

	const fonts: Glyph[][] = [];
	let penX = PADDING;
	let penY = PADDING;
	let rowH = 0;

	for (const { family } of FONT_FILES) {
		ctx.font = `${FONT_PX}px ${family}`;
		const glyphs: Glyph[] = [];
		for (let code = FIRST_CHAR; code <= LAST_CHAR; code++) {
			const ch = String.fromCharCode(code);
			const m = ctx.measureText(ch);
			const left = Math.ceil(m.actualBoundingBoxLeft);
			const right = Math.ceil(m.actualBoundingBoxRight);
			const ascent = Math.ceil(m.actualBoundingBoxAscent);
			const descent = Math.ceil(m.actualBoundingBoxDescent);
			const w = Math.max(1, left + right + 1);
			const h = Math.max(1, ascent + descent + 1);

			if (penX + w + PADDING > size) {
				penX = PADDING;
				penY += rowH + PADDING;
				rowH = 0;
			}
			if (penY + h + PADDING > size) {
				throw new Error("glyph atlas overflow");
			}
			ctx.fillText(ch, penX + left, penY + ascent);
			glyphs.push({
				x: penX,
				y: penY,
				w,
				h,
				ox: -left,
				oy: -ascent,
				advance: m.width,
			});
			penX += w + PADDING;
			rowH = Math.max(rowH, h);
		}
		fonts.push(glyphs);
	}

	const image = ctx.getImageData(0, 0, size, size);
	return { size, pixels: new Uint8Array(image.data.buffer), fonts };
}

/**
 * Expands glyph runs to textured-quad vertices: interleaved
 * `x f32, y f32, u f32, v f32, rgba u8x4` (20 bytes, 6 vertices per glyph).
 * Returns the vertex count; quads that would overflow `out` are dropped.
 */
export function layoutGlyphs(
	atlas: GlyphAtlas,
	runs: readonly { x: number; y: number; color: number; fontId: number; text: string }[],
	out: DataView,
): number {
	const capacity = Math.floor(out.byteLength / 20);
	let vertex = 0;
	for (const run of runs) {
		const glyphs = atlas.fonts[run.fontId] ?? atlas.fonts[0];
		if (!glyphs) {
			continue;
		}
		let penX = run.x;
		for (let i = 0; i < run.text.length; i++) {
			const code = run.text.charCodeAt(i);
			const glyph = glyphs[code - FIRST_CHAR];
			if (!glyph) {
				continue;
			}
			if (vertex + 6 > capacity) {
				return vertex;
			}
			const x0 = Math.round(penX + glyph.ox);
			const y0 = Math.round(run.y + glyph.oy);
			vertex = putQuad(out, vertex, x0, y0, glyph, atlas.size, run.color);
			penX += glyph.advance;
		}
	}
	return vertex;
}

function putQuad(
	out: DataView,
	vertex: number,
	x0: number,
	y0: number,
	glyph: Glyph,
	atlasSize: number,
	color: number,
): number {
	const x1 = x0 + glyph.w;
	const y1 = y0 + glyph.h;
	const u0 = glyph.x / atlasSize;
	const v0 = glyph.y / atlasSize;
	const u1 = (glyph.x + glyph.w) / atlasSize;
	const v1 = (glyph.y + glyph.h) / atlasSize;
	putVertex(out, vertex++, x0, y0, u0, v0, color);
	putVertex(out, vertex++, x1, y0, u1, v0, color);
	putVertex(out, vertex++, x1, y1, u1, v1, color);
	putVertex(out, vertex++, x0, y0, u0, v0, color);
	putVertex(out, vertex++, x1, y1, u1, v1, color);
	putVertex(out, vertex++, x0, y1, u0, v1, color);
	return vertex;
}

function putVertex(
	out: DataView,
	index: number,
	x: number,
	y: number,
	u: number,
	v: number,
	color: number,
): void {
	const at = index * 20;
	out.setFloat32(at, x, true);
	out.setFloat32(at + 4, y, true);
	out.setFloat32(at + 8, u, true);
	out.setFloat32(at + 12, v, true);
	out.setUint8(at + 16, (color >>> 24) & 0xff);
	out.setUint8(at + 17, (color >>> 16) & 0xff);
	out.setUint8(at + 18, (color >>> 8) & 0xff);
	out.setUint8(at + 19, color & 0xff);
}
