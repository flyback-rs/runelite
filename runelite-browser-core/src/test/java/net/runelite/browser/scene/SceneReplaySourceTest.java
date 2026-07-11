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

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.runelite.browser.platform.SceneCommandBuffer;
import net.runelite.browser.platform.SceneCommandBuffer.Section;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class SceneReplaySourceTest
{
	@Test
	public void producesExpectedSections()
	{
		SceneReplaySource source = new SceneReplaySource(800, 600);
		SceneCommandBuffer buffer = new SceneCommandBuffer();
		source.fill(buffer, 0);

		Map<Integer, Section> byType = new HashMap<>();
		for (Section section : SceneCommandBuffer.parse(buffer.finish()))
		{
			byType.put(section.type(), section);
		}

		Section camera = byType.get(SceneCommandBuffer.SECTION_CAMERA);
		assertNotNull(camera);
		assertEquals(1, camera.elementCount());
		// worldProj(64) + entityProj(64) + base(12) + tint(16) + cam(20) + fog(12) + brightness(4) + drawDistance(4) + tick(4)
		assertEquals(200, camera.payload().length);

		Section vertices = byType.get(SceneCommandBuffer.SECTION_VERTEX_DATA);
		assertNotNull(vertices);
		assertEquals(SceneReplaySource.VERTEX_COUNT, vertices.elementCount());
		assertEquals(SceneReplaySource.VERTEX_COUNT * 24, vertices.payload().length);

		Section batches = byType.get(SceneCommandBuffer.SECTION_DRAW_BATCHES);
		assertNotNull(batches);
		assertEquals(SceneReplaySource.BATCH_COUNT, batches.elementCount());
		assertEquals(SceneReplaySource.BATCH_COUNT * 16, batches.payload().length);

		assertNotNull(byType.get(SceneCommandBuffer.SECTION_OVERLAY_QUADS));

		Section glyphs = byType.get(SceneCommandBuffer.SECTION_GLYPH_RUNS);
		assertNotNull(glyphs);
		assertEquals(2, glyphs.elementCount());
	}

	@Test
	public void translucentBatchesFollowOpaqueAndCoverAllVertices()
	{
		SceneReplaySource source = new SceneReplaySource(800, 600);
		SceneCommandBuffer buffer = new SceneCommandBuffer();
		source.fill(buffer, 17);

		byte[] payload = null;
		for (Section section : SceneCommandBuffer.parse(buffer.finish()))
		{
			if (section.type() == SceneCommandBuffer.SECTION_DRAW_BATCHES)
			{
				payload = section.payload();
			}
		}
		assertNotNull(payload);

		int covered = 0;
		boolean sawTranslucent = false;
		for (int i = 0; i < payload.length; i += 16)
		{
			int vertexCount = readIntLe(payload, i + 8);
			int flags = readIntLe(payload, i + 12);
			covered += vertexCount;
			if ((flags & SceneCommandBuffer.BATCH_TRANSLUCENT) != 0)
			{
				sawTranslucent = true;
			}
			else
			{
				assertTrue("opaque batch after a translucent one", !sawTranslucent);
			}
		}
		assertEquals(SceneReplaySource.VERTEX_COUNT, covered);
		assertTrue(sawTranslucent);
	}

	private static int readIntLe(byte[] bytes, int at)
	{
		return (bytes[at] & 0xff)
			| ((bytes[at + 1] & 0xff) << 8)
			| ((bytes[at + 2] & 0xff) << 16)
			| ((bytes[at + 3] & 0xff) << 24);
	}

	@Test
	public void isDeterministicPerFrameAndAnimates()
	{
		SceneReplaySource source = new SceneReplaySource(640, 480);
		SceneCommandBuffer a = new SceneCommandBuffer();
		SceneCommandBuffer b = new SceneCommandBuffer();

		source.fill(a, 5);
		int sizeA = a.size();
		source.fill(b, 5);
		assertEquals(sizeA, b.size());

		// A later frame animates (the camera/model matrices differ), so the bytes change.
		SceneCommandBuffer c = new SceneCommandBuffer();
		source.fill(c, 50);
		assertTrue(differ(a.finish(), c.finish()));
	}

	private static boolean differ(java.nio.ByteBuffer x, java.nio.ByteBuffer y)
	{
		if (x.remaining() != y.remaining())
		{
			return true;
		}
		List<Section> sx = SceneCommandBuffer.parse(x);
		List<Section> sy = SceneCommandBuffer.parse(y);
		byte[] cx = sx.get(0).payload();
		byte[] cy = sy.get(0).payload();
		for (int i = 0; i < cx.length; i++)
		{
			if (cx[i] != cy[i])
			{
				return true;
			}
		}
		return false;
	}
}
