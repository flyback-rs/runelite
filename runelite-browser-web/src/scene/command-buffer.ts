/**
 * Reader for the packed per-frame scene format produced by the Java
 * `net.runelite.browser.platform.SceneCommandBuffer`. This is the single source
 * of truth for the binary contract on the TypeScript side; it must stay in sync
 * with the Java writer.
 *
 * Layout (little-endian): header `magic 'RSCB' | version u16 | sectionCount u16`,
 * then each section `type u16 | elementCount i32 | byteLength i32 | payload`.
 */

export const MAGIC = 0x52534342; // 'RSCB'
export const VERSION = 2;

export const SECTION_ENTITY_TRANSFORMS = 1;
export const SECTION_MESH_RANGES = 2;
export const SECTION_MATERIAL_IDS = 3;
export const SECTION_OVERLAY_QUADS = 4;
export const SECTION_GLYPH_RUNS = 5;
export const SECTION_CAMERA = 6;
export const SECTION_VERTEX_DATA = 7;
export const SECTION_DRAW_BATCHES = 8;

/** Bytes per vertex in {@link SECTION_VERTEX_DATA}. */
export const VERTEX_STRIDE = 24;

/** Draw-batch flag: blend this batch after all opaque batches. */
export const BATCH_TRANSLUCENT = 1;

/** One texture tile in the vertex `tex` field's Q12 fixed point. */
export const UV_ONE = 4096;

export interface CameraUniforms {
	readonly worldProj: Float32Array; // 16, column-major
	readonly entityProj: Float32Array; // 16, column-major
	readonly base: Int32Array; // 3
	readonly entityTint: Int32Array; // 4
	readonly cameraYaw: number;
	readonly cameraPitch: number;
	readonly cameraX: number;
	readonly cameraY: number;
	readonly cameraZ: number;
	readonly useFog: number;
	readonly fogDepth: number;
	readonly fogColor: number;
	readonly brightness: number;
	readonly drawDistance: number;
	readonly tick: number;
}

export interface DrawBatch {
	readonly materialId: number;
	readonly firstVertex: number;
	readonly vertexCount: number;
	/**
	 * Bit 0 ({@link BATCH_TRANSLUCENT}): draw after all opaque batches, blended,
	 * without depth writes. Translucent batches arrive back-to-front (the
	 * producer sorts, as the game client sorts its own translucent geometry).
	 */
	readonly flags: number;
}

export interface GlyphRun {
	/** Baseline origin in pixels (top-left screen origin). */
	readonly x: number;
	readonly y: number;
	/** Packed RGBA8: `(r << 24) | (g << 16) | (b << 8) | a`. */
	readonly color: number;
	/** 0 = small, 1 = regular, 2 = bold. */
	readonly fontId: number;
	readonly text: string;
}

export interface OverlayQuad {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	/** Packed RGBA8: `(r << 24) | (g << 16) | (b << 8) | a`. */
	readonly color: number;
}

export interface Frame {
	readonly version: number;
	readonly camera: CameraUniforms | null;
	/** Raw interleaved vertices ({@link VERTEX_STRIDE} bytes each), or null. */
	readonly vertices: Uint8Array | null;
	readonly vertexCount: number;
	readonly batches: DrawBatch[];
	readonly overlays: OverlayQuad[];
	readonly glyphs: GlyphRun[];
}

interface RawSection {
	readonly type: number;
	readonly elementCount: number;
	readonly offset: number;
	readonly byteLength: number;
}

/** Splits a packed buffer into its raw sections. */
export function parseSections(view: DataView): { version: number; sections: RawSection[] } {
	const magic = view.getUint32(0, true);
	if (magic !== MAGIC) {
		throw new Error(`Not a scene command buffer: 0x${magic.toString(16)}`);
	}
	const version = view.getUint16(4, true);
	const sectionCount = view.getUint16(6, true);
	const sections: RawSection[] = [];
	let offset = 8;
	for (let i = 0; i < sectionCount; i++) {
		const type = view.getUint16(offset, true);
		const elementCount = view.getInt32(offset + 2, true);
		const byteLength = view.getInt32(offset + 6, true);
		sections.push({ type, elementCount, offset: offset + 10, byteLength });
		offset += 10 + byteLength;
	}
	return { version, sections };
}

/** Parses a packed frame into typed, ready-to-upload data. */
export function parseFrame(bytes: Uint8Array, length = bytes.byteLength): Frame {
	const view = new DataView(bytes.buffer, bytes.byteOffset, length);
	const { version, sections } = parseSections(view);
	if (version !== VERSION) {
		// Both sides ship together; a mismatch means a stale wasm or bundle.
		throw new Error(`scene command buffer version ${version}, expected ${VERSION}`);
	}

	let camera: CameraUniforms | null = null;
	let vertices: Uint8Array | null = null;
	let vertexCount = 0;
	const batches: DrawBatch[] = [];
	const overlays: OverlayQuad[] = [];
	const glyphs: GlyphRun[] = [];

	for (const section of sections) {
		switch (section.type) {
			case SECTION_CAMERA:
				camera = readCamera(view, section.offset);
				break;
			case SECTION_VERTEX_DATA:
				vertexCount = section.elementCount;
				vertices = bytes.subarray(section.offset, section.offset + section.byteLength);
				break;
			case SECTION_DRAW_BATCHES:
				for (let i = 0; i < section.elementCount; i++) {
					const at = section.offset + i * 16;
					batches.push({
						materialId: view.getInt32(at, true),
						firstVertex: view.getInt32(at + 4, true),
						vertexCount: view.getInt32(at + 8, true),
						flags: view.getInt32(at + 12, true),
					});
				}
				break;
			case SECTION_OVERLAY_QUADS:
				for (let i = 0; i < section.elementCount; i++) {
					const at = section.offset + i * 20;
					overlays.push({
						x: view.getFloat32(at, true),
						y: view.getFloat32(at + 4, true),
						w: view.getFloat32(at + 8, true),
						h: view.getFloat32(at + 12, true),
						color: view.getUint32(at + 16, true),
					});
				}
				break;
			case SECTION_GLYPH_RUNS: {
				let at = section.offset;
				for (let i = 0; i < section.elementCount; i++) {
					const charCount = view.getUint16(at + 14, true);
					let text = "";
					for (let c = 0; c < charCount; c++) {
						text += String.fromCharCode(view.getUint8(at + 16 + c));
					}
					glyphs.push({
						x: view.getFloat32(at, true),
						y: view.getFloat32(at + 4, true),
						color: view.getUint32(at + 8, true),
						fontId: view.getUint16(at + 12, true),
						text,
					});
					at += 16 + charCount;
				}
				break;
			}
			default:
				break;
		}
	}

	return { version, camera, vertices, vertexCount, batches, overlays, glyphs };
}

function readCamera(view: DataView, offset: number): CameraUniforms {
	let at = offset;
	const worldProj = new Float32Array(16);
	for (let i = 0; i < 16; i++, at += 4) {
		worldProj[i] = view.getFloat32(at, true);
	}
	const entityProj = new Float32Array(16);
	for (let i = 0; i < 16; i++, at += 4) {
		entityProj[i] = view.getFloat32(at, true);
	}
	const base = new Int32Array(3);
	for (let i = 0; i < 3; i++, at += 4) {
		base[i] = view.getInt32(at, true);
	}
	const entityTint = new Int32Array(4);
	for (let i = 0; i < 4; i++, at += 4) {
		entityTint[i] = view.getInt32(at, true);
	}
	const cameraYaw = view.getFloat32(at, true);
	const cameraPitch = view.getFloat32(at + 4, true);
	const cameraX = view.getFloat32(at + 8, true);
	const cameraY = view.getFloat32(at + 12, true);
	const cameraZ = view.getFloat32(at + 16, true);
	at += 20;
	const useFog = view.getInt32(at, true);
	const fogDepth = view.getInt32(at + 4, true);
	const fogColor = view.getInt32(at + 8, true);
	at += 12;
	const brightness = view.getFloat32(at, true);
	const drawDistance = view.getInt32(at + 4, true);
	const tick = view.getInt32(at + 8, true);

	return {
		worldProj,
		entityProj,
		base,
		entityTint,
		cameraYaw,
		cameraPitch,
		cameraX,
		cameraY,
		cameraZ,
		useFog,
		fogDepth,
		fogColor,
		brightness,
		drawDistance,
		tick,
	};
}
