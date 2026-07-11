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
package net.runelite.browser.platform;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.List;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class SceneCommandBufferTest
{
	@Test
	public void packAndParseRoundTrip()
	{
		SceneCommandBuffer buffer = new SceneCommandBuffer(16);
		byte[] transforms = {1, 2, 3, 4, 5, 6, 7, 8};
		byte[] materials = {9, 10};
		buffer.putSection(SceneCommandBuffer.SECTION_ENTITY_TRANSFORMS, 2, transforms);
		buffer.putSection(SceneCommandBuffer.SECTION_MATERIAL_IDS, 2, materials);
		assertEquals(2, buffer.getSectionCount());

		List<SceneCommandBuffer.Section> sections = SceneCommandBuffer.parse(buffer.finish());
		assertEquals(2, sections.size());
		assertEquals(SceneCommandBuffer.SECTION_ENTITY_TRANSFORMS, sections.get(0).type());
		assertEquals(2, sections.get(0).elementCount());
		assertArrayEquals(transforms, sections.get(0).payload());
		assertEquals(SceneCommandBuffer.SECTION_MATERIAL_IDS, sections.get(1).type());
		assertArrayEquals(materials, sections.get(1).payload());
	}

	@Test
	public void resetReusesBufferAndClearsSections()
	{
		SceneCommandBuffer buffer = new SceneCommandBuffer(16);
		buffer.putSection(SceneCommandBuffer.SECTION_GLYPH_RUNS, 1, new byte[]{42});
		buffer.finish();
		int firstSize = buffer.size();

		buffer.reset();
		assertEquals(0, buffer.getSectionCount());
		assertEquals(0, SceneCommandBuffer.parse(buffer.finish()).size());

		buffer.reset();
		buffer.putSection(SceneCommandBuffer.SECTION_GLYPH_RUNS, 1, new byte[]{42});
		buffer.finish();
		assertEquals(firstSize, buffer.size());
	}

	@Test
	public void growsBeyondInitialCapacity()
	{
		SceneCommandBuffer buffer = new SceneCommandBuffer(8);
		byte[] big = new byte[1024];
		buffer.putSection(SceneCommandBuffer.SECTION_OVERLAY_QUADS, 4, big);
		List<SceneCommandBuffer.Section> sections = SceneCommandBuffer.parse(buffer.finish());
		assertEquals(1, sections.size());
		assertEquals(1024, sections.get(0).payload().length);
	}

	@Test(expected = IllegalArgumentException.class)
	public void parseRejectsBadMagic()
	{
		SceneCommandBuffer.parse(ByteBuffer.allocate(8));
	}

	@Test
	public void beginPutEndSectionRoundTrips()
	{
		SceneCommandBuffer buffer = new SceneCommandBuffer(16);
		buffer.beginSection(SceneCommandBuffer.SECTION_CAMERA, 1);
		buffer.putFloat(1.5f).putFloat(-2.25f);
		buffer.putInt(0x01020304);
		buffer.putShortValue(0x0a0b);
		buffer.endSection();

		buffer.beginSection(SceneCommandBuffer.SECTION_DRAW_BATCHES, 2);
		buffer.putInt(7).putInt(8).putInt(9);
		buffer.endSection();

		List<SceneCommandBuffer.Section> sections = SceneCommandBuffer.parse(buffer.finish());
		assertEquals(2, sections.size());

		SceneCommandBuffer.Section camera = sections.get(0);
		assertEquals(SceneCommandBuffer.SECTION_CAMERA, camera.type());
		assertEquals(1, camera.elementCount());
		assertEquals(14, camera.payload().length);
		ByteBuffer payload = ByteBuffer.wrap(camera.payload()).order(ByteOrder.LITTLE_ENDIAN);
		assertEquals(1.5f, Float.intBitsToFloat(payload.getInt()), 0f);
		assertEquals(-2.25f, Float.intBitsToFloat(payload.getInt()), 0f);
		assertEquals(0x01020304, payload.getInt());
		assertEquals((short) 0x0a0b, payload.getShort());

		SceneCommandBuffer.Section batches = sections.get(1);
		assertEquals(SceneCommandBuffer.SECTION_DRAW_BATCHES, batches.type());
		assertEquals(2, batches.elementCount());
		assertEquals(12, batches.payload().length);
	}
}
