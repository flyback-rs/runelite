import { describe, expect, it } from "vitest";
import {
	MAGIC,
	parseFrame,
	SECTION_CAMERA,
	SECTION_DRAW_BATCHES,
	SECTION_OVERLAY_QUADS,
	SECTION_VERTEX_DATA,
	VERSION,
	VERTEX_STRIDE,
} from "../src/scene/command-buffer.ts";

/**
 * Independently encodes a frame using the documented little-endian layout (kept
 * separate from the reader so a change on either side is caught) and checks the
 * reader decodes each section. This guards the Java <-> TypeScript binary contract.
 */
function encodeFrame(): Uint8Array {
	// One camera + two vertices + one batch + one overlay quad.
	const cameraBytes = 200;
	const vertexCount = 2;
	const vertexBytes = vertexCount * VERTEX_STRIDE;
	const batchBytes = 12;
	const overlayBytes = 20;
	const total =
		8 + (10 + cameraBytes) + (10 + vertexBytes) + (10 + batchBytes) + (10 + overlayBytes);

	const buffer = new ArrayBuffer(total);
	const view = new DataView(buffer);
	let at = 0;

	// header
	view.setUint32(at, MAGIC, true);
	view.setUint16(at + 4, VERSION, true);
	view.setUint16(at + 6, 4, true);
	at += 8;

	const section = (type: number, elementCount: number, byteLength: number): number => {
		view.setUint16(at, type, true);
		view.setInt32(at + 2, elementCount, true);
		view.setInt32(at + 6, byteLength, true);
		at += 10;
		const start = at;
		at += byteLength;
		return start;
	};

	// camera
	let c = section(SECTION_CAMERA, 1, cameraBytes);
	for (let i = 0; i < 16; i++, c += 4) view.setFloat32(c, i === 0 ? 2 : i, true); // worldProj
	for (let i = 0; i < 16; i++, c += 4) view.setFloat32(c, 100 + i, true); // entityProj
	view.setInt32(c, 1, true);
	view.setInt32(c + 4, 2, true);
	view.setInt32(c + 8, 3, true);
	c += 12; // base
	view.setInt32(c, 4, true);
	view.setInt32(c + 4, 5, true);
	view.setInt32(c + 8, 6, true);
	view.setInt32(c + 12, 7, true);
	c += 16; // tint
	view.setFloat32(c, 0.1, true);
	view.setFloat32(c + 4, 0.2, true);
	view.setFloat32(c + 8, 0.3, true);
	view.setFloat32(c + 12, 0.4, true);
	view.setFloat32(c + 16, 5, true);
	c += 20; // cam yaw/pitch/x/y/z
	view.setInt32(c, 1, true);
	view.setInt32(c + 4, 40, true);
	view.setInt32(c + 8, 0x00abcdef, true);
	c += 12; // useFog/fogDepth/fogColor
	view.setFloat32(c, 1, true); // brightness
	view.setInt32(c + 4, 1000, true); // drawDistance
	view.setInt32(c + 8, 42, true); // tick

	// vertices
	let v = section(SECTION_VERTEX_DATA, vertexCount, vertexBytes);
	for (let i = 0; i < vertexCount; i++, v += VERTEX_STRIDE) {
		view.setFloat32(v, i, true);
		view.setFloat32(v + 4, i + 0.5, true);
		view.setFloat32(v + 8, i + 0.25, true);
		view.setInt32(v + 12, 0x0000_1234, true);
	}

	// batch
	const b = section(SECTION_DRAW_BATCHES, 1, batchBytes);
	view.setInt32(b, 9, true);
	view.setInt32(b + 4, 0, true);
	view.setInt32(b + 8, vertexCount, true);

	// overlay
	const o = section(SECTION_OVERLAY_QUADS, 1, overlayBytes);
	view.setFloat32(o, 8, true);
	view.setFloat32(o + 4, 9, true);
	view.setFloat32(o + 8, 140, true);
	view.setFloat32(o + 12, 18, true);
	view.setUint32(o + 16, 0x00c8ffa0, true);

	return new Uint8Array(buffer);
}

describe("parseFrame", () => {
	it("decodes every section of a packed frame", () => {
		const frame = parseFrame(encodeFrame());

		expect(frame.version).toBe(VERSION);

		expect(frame.camera).not.toBeNull();
		const camera = frame.camera!;
		expect(camera.worldProj[0]).toBe(2);
		expect(camera.entityProj[0]).toBe(100);
		expect([...camera.base]).toEqual([1, 2, 3]);
		expect([...camera.entityTint]).toEqual([4, 5, 6, 7]);
		expect(camera.cameraZ).toBeCloseTo(5, 5);
		expect(camera.useFog).toBe(1);
		expect(camera.fogColor).toBe(0x00abcdef);
		expect(camera.brightness).toBeCloseTo(1, 5);
		expect(camera.drawDistance).toBe(1000);
		expect(camera.tick).toBe(42);

		expect(frame.vertexCount).toBe(2);
		expect(frame.vertices?.byteLength).toBe(2 * VERTEX_STRIDE);

		expect(frame.batches).toEqual([{ materialId: 9, firstVertex: 0, vertexCount: 2 }]);

		expect(frame.overlays).toHaveLength(1);
		expect(frame.overlays[0]?.w).toBeCloseTo(140, 3);
		expect(frame.overlays[0]?.color).toBe(0x00c8ffa0);
	});

	it("rejects a buffer without the RSCB magic", () => {
		expect(() => parseFrame(new Uint8Array(8))).toThrow(/scene command buffer/);
	});
});
