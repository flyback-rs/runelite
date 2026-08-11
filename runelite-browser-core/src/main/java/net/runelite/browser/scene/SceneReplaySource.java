/*
 * Copyright (c) 2026, RuneLite Browser Port
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
package net.runelite.browser.scene;

import net.runelite.browser.platform.SceneCommandBuffer;

/**
 * A deterministic synthetic scene producer standing in for the (unavailable)
 * injected game client. Each frame it fills a {@link SceneCommandBuffer} with a
 * textured floor, a spinning cube mixing textured and HSL-coloured faces, two
 * translucent panels emitted back-to-front, a HUD overlay quad and glyph runs —
 * exercising every renderer feature (texture-array sampling via the vertex
 * {@code tex} field, the translucent pass ordering contract, and text) with the
 * same vertex layout, packed-{@code abhsl} colour word, reversed-Z projection
 * and camera section the real geometry will use. Output is a pure function of
 * the frame index, so the renderer path can be verified end to end.
 */
public final class SceneReplaySource
{
	/** floor(6) + cube(36) + two panels(12). */
	public static final int VERTEX_COUNT = 54;

	/** Batches: 1 opaque (floor + cube) + 2 translucent panels. */
	public static final int BATCH_COUNT = 3;

	/** Q12 fixed point: one texture tile. */
	private static final int UV_ONE = 4096;

	private static final float[][] CORNERS = {
		{-1f, -1f, -1f},
		{1f, -1f, -1f},
		{1f, 1f, -1f},
		{-1f, 1f, -1f},
		{-1f, -1f, 1f},
		{1f, -1f, 1f},
		{1f, 1f, 1f},
		{-1f, 1f, 1f},
	};

	// {corner indices a,b,c,d, hue, material} per face; a,b,c,d wound as two
	// triangles. Material 0 = untextured HSL; textured faces use a near-white
	// HSL so the texture dominates after modulation.
	private static final int[][] FACES = {
		{0, 1, 2, 3, 0, 0},
		{5, 4, 7, 6, 10, 0},
		{4, 0, 3, 7, 21, 2},
		{1, 5, 6, 2, 32, 3},
		{3, 2, 6, 7, 42, 0},
		{4, 5, 1, 0, 52, 0},
	};

	// Translucent panel centre z in model space; the panels rotate with the cube.
	private static final float PANEL_Z = 2.2f;

	private float aspect;

	public SceneReplaySource(int width, int height)
	{
		resize(width, height);
	}

	/**
	 * Updates the projection aspect ratio for a new viewport size.
	 *
	 * @param width viewport width
	 * @param height viewport height
	 */
	public void resize(int width, int height)
	{
		this.aspect = height > 0 ? (float) width / (float) height : 1f;
	}

	/**
	 * Fills {@code buf} with the frame for {@code frameIndex}.
	 *
	 * @param buf a reusable command buffer
	 * @param frameIndex the frame number, driving the animation
	 */
	public void fill(SceneCommandBuffer buf, int frameIndex)
	{
		buf.reset();

		float angle = frameIndex * 0.02f;
		float[] model = Mat4.multiply(Mat4.rotationY(angle), Mat4.rotationX(angle * 0.5f));
		float[] view = Mat4.translation(0f, 0f, -5f);
		float[] worldProj = Mat4.multiply(Mat4.perspectiveReversedZ(1.0f, aspect, 0.1f), view);

		buf.beginSection(SceneCommandBuffer.SECTION_CAMERA, 1);
		buf.putFloats(worldProj);
		buf.putFloats(model);
		buf.putInt(0).putInt(0).putInt(0);
		buf.putInt(0).putInt(0).putInt(0).putInt(0);
		buf.putFloat(0f).putFloat(0f).putFloat(0f).putFloat(0f).putFloat(5f);
		buf.putInt(0).putInt(0).putInt(0);
		buf.putFloat(1.0f);
		buf.putInt(1000);
		buf.putInt(frameIndex & 127);
		buf.endSection();

		// The panels sit at model-space z = ±PANEL_Z and rotate with the cube;
		// their view depth decides emission order (back-to-front). With no model
		// translation, view z is rotatedZ - 5, so the smaller rotated z is farther.
		float frontZ = rotatedZ(model, 0f, 0f, PANEL_Z);
		float backZ = rotatedZ(model, 0f, 0f, -PANEL_Z);
		boolean frontIsFarther = frontZ < backZ;

		buf.beginSection(SceneCommandBuffer.SECTION_VERTEX_DATA, VERTEX_COUNT);
		emitFloor(buf);
		for (int[] face : FACES)
		{
			// Near-white base for textured faces so modulation keeps texture detail.
			int abhsl = face[5] != 0 ? hsl(0, 0, 100) : hsl(face[4], 7, 64);
			int material = face[5];
			emitQuad(buf,
				CORNERS[face[0]], CORNERS[face[1]], CORNERS[face[2]], CORNERS[face[3]],
				abhsl, material, UV_ONE);
		}
		emitPanel(buf, frontIsFarther ? PANEL_Z : -PANEL_Z,
			frontIsFarther ? hsl(35, 6, 80) : hsl(52, 6, 80));
		emitPanel(buf, frontIsFarther ? -PANEL_Z : PANEL_Z,
			frontIsFarther ? hsl(52, 6, 80) : hsl(35, 6, 80));
		buf.endSection();

		buf.beginSection(SceneCommandBuffer.SECTION_DRAW_BATCHES, BATCH_COUNT);
		buf.putInt(0).putInt(0).putInt(42).putInt(0);
		buf.putInt(0).putInt(42).putInt(6).putInt(SceneCommandBuffer.BATCH_TRANSLUCENT);
		buf.putInt(0).putInt(48).putInt(6).putInt(SceneCommandBuffer.BATCH_TRANSLUCENT);
		buf.endSection();

		buf.beginSection(SceneCommandBuffer.SECTION_OVERLAY_QUADS, 1);
		buf.putFloat(8f).putFloat(8f).putFloat(140f).putFloat(18f);
		buf.putInt(rgba(0, 200, 255, 160));
		buf.endSection();

		emitGlyphRuns(buf, frameIndex);
	}

	private static void emitFloor(SceneCommandBuffer buf)
	{
		// An 8x8 plane below the cube, checker material (1), tiled 4x.
		float y = -2f;
		float e = 4f;
		int abhsl = hsl(0, 0, 90);
		int uv = 4 * UV_ONE;
		float[] a = {-e, y, -e};
		float[] b = {e, y, -e};
		float[] c = {e, y, e};
		float[] d = {-e, y, e};
		emitVertex(buf, a, abhsl, 1, 0, 0);
		emitVertex(buf, b, abhsl, 1, uv, 0);
		emitVertex(buf, c, abhsl, 1, uv, uv);
		emitVertex(buf, a, abhsl, 1, 0, 0);
		emitVertex(buf, c, abhsl, 1, uv, uv);
		emitVertex(buf, d, abhsl, 1, 0, uv);
	}

	private static void emitQuad(SceneCommandBuffer buf,
		float[] a, float[] b, float[] c, float[] d, int abhsl, int material, int uvMax)
	{
		emitVertex(buf, a, abhsl, material, 0, 0);
		emitVertex(buf, b, abhsl, material, uvMax, 0);
		emitVertex(buf, c, abhsl, material, uvMax, uvMax);
		emitVertex(buf, a, abhsl, material, 0, 0);
		emitVertex(buf, c, abhsl, material, uvMax, uvMax);
		emitVertex(buf, d, abhsl, material, 0, uvMax);
	}

	private static void emitPanel(SceneCommandBuffer buf, float z, int hslColor)
	{
		// Translucent: alpha byte 96 -> vertex alpha ~0.62 (shader uses 1 - a/255).
		int abhsl = (96 << 24) | hslColor;
		float e = 1.6f;
		float[] a = {-e, -e, z};
		float[] b = {e, -e, z};
		float[] c = {e, e, z};
		float[] d = {-e, e, z};
		emitQuad(buf, a, b, c, d, abhsl, 0, UV_ONE);
	}

	private void emitGlyphRuns(SceneCommandBuffer buf, int frameIndex)
	{
		String title = "RuneLite Browser";
		String tick = "tick " + (frameIndex & 127);
		buf.beginSection(SceneCommandBuffer.SECTION_GLYPH_RUNS, 2);
		putGlyphRun(buf, 10f, 46f, rgba(255, 184, 63, 255), 2, title);
		putGlyphRun(buf, 10f, 64f, rgba(230, 230, 230, 255), 0, tick);
		buf.endSection();
	}

	private static void putGlyphRun(SceneCommandBuffer buf, float x, float y, int color, int fontId, String text)
	{
		buf.putFloat(x).putFloat(y);
		buf.putInt(color);
		buf.putShortValue(fontId);
		buf.putShortValue(text.length());
		for (int i = 0; i < text.length(); i++)
		{
			buf.putByte(text.charAt(i) & 0x7f);
		}
	}

	private static void emitVertex(SceneCommandBuffer buf, float[] pos, int abhsl, int material, int u, int v)
	{
		buf.putFloat(pos[0]).putFloat(pos[1]).putFloat(pos[2]);
		buf.putInt(abhsl);
		buf.putShortValue(material).putShortValue(u).putShortValue(v).putShortValue(0);
	}

	/** The z of (x,y,z) under the column-major rotation {@code m} (no translation). */
	private static float rotatedZ(float[] m, float x, float y, float z)
	{
		return m[2] * x + m[6] * y + m[10] * z;
	}

	// Packs an opaque OSRS colour: transparency 0, bias 0, 16-bit HSL.
	private static int hsl(int hue, int sat, int lum)
	{
		return ((hue & 63) << 10) | ((sat & 7) << 7) | (lum & 127);
	}

	private static int rgba(int r, int g, int b, int a)
	{
		return ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff);
	}
}
