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
 * spinning, per-face HSL-coloured cube plus a HUD overlay quad, using the same
 * vertex layout, packed-{@code abhsl} colour word, reversed-Z projection and
 * camera/uniform section the real geometry will use. Output is a pure function of
 * the frame index, so the renderer path can be exercised and verified end to end.
 */
public final class SceneReplaySource
{
	/** 6 faces * 2 triangles * 3 vertices. */
	public static final int VERTEX_COUNT = 36;

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

	// {corner indices a,b,c,d, hue} per face; a,b,c,d wound as two triangles.
	private static final int[][] FACES = {
		{0, 1, 2, 3, 0},
		{5, 4, 7, 6, 10},
		{4, 0, 3, 7, 21},
		{1, 5, 6, 2, 32},
		{3, 2, 6, 7, 42},
		{4, 5, 1, 0, 52},
	};

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

		buf.beginSection(SceneCommandBuffer.SECTION_VERTEX_DATA, VERTEX_COUNT);
		for (int[] face : FACES)
		{
			int abhsl = hsl(face[4], 7, 64);
			emitVertex(buf, CORNERS[face[0]], abhsl);
			emitVertex(buf, CORNERS[face[1]], abhsl);
			emitVertex(buf, CORNERS[face[2]], abhsl);
			emitVertex(buf, CORNERS[face[0]], abhsl);
			emitVertex(buf, CORNERS[face[2]], abhsl);
			emitVertex(buf, CORNERS[face[3]], abhsl);
		}
		buf.endSection();

		buf.beginSection(SceneCommandBuffer.SECTION_DRAW_BATCHES, 1);
		buf.putInt(0).putInt(0).putInt(VERTEX_COUNT);
		buf.endSection();

		buf.beginSection(SceneCommandBuffer.SECTION_OVERLAY_QUADS, 1);
		buf.putFloat(8f).putFloat(8f).putFloat(140f).putFloat(18f);
		buf.putInt(rgba(0, 200, 255, 160));
		buf.endSection();
	}

	private static void emitVertex(SceneCommandBuffer buf, float[] pos, int abhsl)
	{
		buf.putFloat(pos[0]).putFloat(pos[1]).putFloat(pos[2]);
		buf.putInt(abhsl);
		buf.putShortValue(0).putShortValue(0).putShortValue(0).putShortValue(0);
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
