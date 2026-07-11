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
import java.util.ArrayList;
import java.util.List;

/**
 * A packed, reusable command buffer describing one frame for the renderer. It is
 * the single value passed across the Wasm/JS boundary per frame instead of many
 * fine-grained calls.
 *
 * <p>Layout (little endian): a header of {@code magic(4) | version(2) |
 * sectionCount(2)} followed by {@code sectionCount} sections, each
 * {@code type(2) | elementCount(4) | byteLength(4) | payload[byteLength]}. The
 * section kinds mirror the architecture's scene layout: entity transforms, mesh
 * ranges, material ids, overlay quads and glyph runs.</p>
 *
 * <p>The backing memory is reused across frames: {@link #reset()} rewinds without
 * allocating, and the buffer only grows when a frame needs more room than any
 * previous frame.</p>
 */
public final class SceneCommandBuffer
{
	/** Magic number 'RSCB' identifying the buffer. */
	public static final int MAGIC = 0x52534342;
	/** Layout version. */
	public static final short VERSION = 1;

	public static final int SECTION_ENTITY_TRANSFORMS = 1;
	public static final int SECTION_MESH_RANGES = 2;
	public static final int SECTION_MATERIAL_IDS = 3;
	public static final int SECTION_OVERLAY_QUADS = 4;
	public static final int SECTION_GLYPH_RUNS = 5;

	private static final int HEADER_SIZE = 8;
	private static final int SECTION_HEADER_SIZE = 10;
	private static final int SECTION_COUNT_OFFSET = 6;

	private ByteBuffer buffer;
	private int sectionCount;

	public SceneCommandBuffer()
	{
		this(4096);
	}

	public SceneCommandBuffer(int initialCapacity)
	{
		buffer = ByteBuffer.allocate(Math.max(initialCapacity, HEADER_SIZE)).order(ByteOrder.LITTLE_ENDIAN);
		reset();
	}

	/**
	 * Rewinds the buffer to an empty frame, reusing the existing backing memory.
	 */
	public void reset()
	{
		buffer.clear();
		buffer.putInt(MAGIC);
		buffer.putShort(VERSION);
		buffer.putShort((short) 0);
		sectionCount = 0;
	}

	public SceneCommandBuffer putSection(int type, int elementCount, byte[] payload)
	{
		return putSection(type, elementCount, payload, 0, payload.length);
	}

	public SceneCommandBuffer putSection(int type, int elementCount, byte[] payload, int offset, int length)
	{
		ensureCapacity(SECTION_HEADER_SIZE + length);
		buffer.putShort((short) type);
		buffer.putInt(elementCount);
		buffer.putInt(length);
		buffer.put(payload, offset, length);
		sectionCount++;
		return this;
	}

	/**
	 * Finalises the frame by patching the section count into the header and
	 * returns a view positioned at the start and limited to the written length.
	 * The view shares memory with this buffer, so read it before the next
	 * {@link #reset()}.
	 *
	 * @return a readable view of the packed frame
	 */
	public ByteBuffer finish()
	{
		buffer.putShort(SECTION_COUNT_OFFSET, (short) sectionCount);
		ByteBuffer view = buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN);
		view.flip();
		return view;
	}

	public int getSectionCount()
	{
		return sectionCount;
	}

	public int size()
	{
		return buffer.position();
	}

	private void ensureCapacity(int additional)
	{
		if (buffer.remaining() >= additional)
		{
			return;
		}
		int required = buffer.position() + additional;
		int newCapacity = Math.max(buffer.capacity() * 2, required);
		ByteBuffer grown = ByteBuffer.allocate(newCapacity).order(ByteOrder.LITTLE_ENDIAN);
		int pos = buffer.position();
		buffer.flip();
		grown.put(buffer);
		grown.position(pos);
		buffer = grown;
	}

	/**
	 * Parses a view produced by {@link #finish()} into its sections.
	 *
	 * @param view the packed frame
	 * @return the sections in order
	 * @throws IllegalArgumentException if the magic or version does not match
	 */
	public static List<Section> parse(ByteBuffer view)
	{
		ByteBuffer b = view.duplicate().order(ByteOrder.LITTLE_ENDIAN);
		int magic = b.getInt();
		if (magic != MAGIC)
		{
			throw new IllegalArgumentException("Not a scene command buffer: 0x" + Integer.toHexString(magic));
		}
		short version = b.getShort();
		if (version != VERSION)
		{
			throw new IllegalArgumentException("Unsupported scene command buffer version: " + version);
		}
		int count = b.getShort() & 0xffff;
		List<Section> sections = new ArrayList<>(count);
		for (int i = 0; i < count; i++)
		{
			int type = b.getShort() & 0xffff;
			int elementCount = b.getInt();
			int length = b.getInt();
			byte[] payload = new byte[length];
			b.get(payload);
			sections.add(new Section(type, elementCount, payload));
		}
		return sections;
	}

	/**
	 * A parsed section: its {@link #type()}, logical {@link #elementCount()} and
	 * raw {@link #payload()} bytes.
	 */
	public static final class Section
	{
		private final int type;
		private final int elementCount;
		private final byte[] payload;

		Section(int type, int elementCount, byte[] payload)
		{
			this.type = type;
			this.elementCount = elementCount;
			this.payload = payload;
		}

		public int type()
		{
			return type;
		}

		public int elementCount()
		{
			return elementCount;
		}

		public byte[] payload()
		{
			return payload;
		}
	}
}
