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
	/** Layout version. Version 2: draw batches carry flags; glyph runs defined. */
	public static final short VERSION = 2;

	public static final int SECTION_ENTITY_TRANSFORMS = 1;
	public static final int SECTION_MESH_RANGES = 2;
	public static final int SECTION_MATERIAL_IDS = 3;
	public static final int SECTION_OVERLAY_QUADS = 4;
	/**
	 * Screen-space text runs: per run {@code x f32}, {@code y f32} (baseline,
	 * pixels), {@code rgba u32} (packed {@code (r<<24)|(g<<16)|(b<<8)|a}),
	 * {@code fontId u16} (0 small, 1 regular, 2 bold), {@code charCount u16},
	 * then {@code charCount} ASCII bytes. {@code elementCount} is the run count.
	 */
	public static final int SECTION_GLYPH_RUNS = 5;
	/**
	 * Per-frame camera and scene uniforms: {@code worldProj[16] f32},
	 * {@code entityProj[16] f32}, {@code base[3] i32}, {@code entityTint[4] i32},
	 * {@code cameraYaw,Pitch,X,Y,Z f32}, {@code useFog,fogDepth,fogColor i32},
	 * {@code brightness f32}, {@code drawDistance i32}, {@code tick i32}. All
	 * matrices are column-major. {@code elementCount} is 1.
	 */
	public static final int SECTION_CAMERA = 6;
	/**
	 * Raw interleaved vertices, 24 bytes each (matches the GPU plugin's dynamic
	 * layout): {@code position[3] f32}, {@code abhsl i32} (alpha b24-31, bias
	 * b16-23, HSL b0-15), {@code tex[4] i16} = (materialId, u, v, 0) where
	 * materials number from 1 (0 = untextured) and u/v are tile coordinates in
	 * Q12 fixed point (1 tile = 4096). {@code elementCount} is the vertex count.
	 */
	public static final int SECTION_VERTEX_DATA = 7;
	/**
	 * Draw batches grouped by material/pipeline: {@code materialId i32},
	 * {@code firstVertex i32}, {@code vertexCount i32}, {@code flags i32} per
	 * batch. Flag bit 0 marks a translucent batch: the renderer draws opaque
	 * batches first (depth write on), then translucent batches with blending
	 * (depth write off) <em>in emitted order</em> — the producer must emit
	 * translucent batches back-to-front, as the game client sorts its own
	 * translucent geometry. {@code elementCount} is the batch count.
	 */
	public static final int SECTION_DRAW_BATCHES = 8;

	/** Draw-batch flag: blend this batch after all opaque batches. */
	public static final int BATCH_TRANSLUCENT = 1;

	private static final int HEADER_SIZE = 8;
	private static final int SECTION_HEADER_SIZE = 10;
	private static final int SECTION_COUNT_OFFSET = 6;

	private ByteBuffer buffer;
	private int sectionCount;
	private int pendingLengthPos = -1;
	private int pendingPayloadStart = -1;

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
	 * Opens a section whose payload is written incrementally with the
	 * {@code put*} methods and closed with {@link #endSection()}. Only one
	 * section may be open at a time. This avoids allocating an intermediate
	 * payload array for sections built from primitives.
	 *
	 * @param type the section type
	 * @param elementCount the logical element count
	 * @return this, for chaining
	 */
	public SceneCommandBuffer beginSection(int type, int elementCount)
	{
		if (pendingLengthPos != -1)
		{
			throw new IllegalStateException("a section is already open; call endSection() first");
		}
		ensureCapacity(SECTION_HEADER_SIZE);
		buffer.putShort((short) type);
		buffer.putInt(elementCount);
		pendingLengthPos = buffer.position();
		buffer.putInt(0);
		pendingPayloadStart = buffer.position();
		sectionCount++;
		return this;
	}

	/**
	 * Closes the section opened by {@link #beginSection(int, int)}, patching its
	 * byte length.
	 *
	 * @return this, for chaining
	 */
	public SceneCommandBuffer endSection()
	{
		buffer.putInt(pendingLengthPos, buffer.position() - pendingPayloadStart);
		pendingLengthPos = -1;
		pendingPayloadStart = -1;
		return this;
	}

	public SceneCommandBuffer putInt(int value)
	{
		ensureCapacity(4);
		buffer.putInt(value);
		return this;
	}

	/**
	 * Appends an IEEE-754 float as a little-endian 32-bit word (readable as
	 * {@code DataView.getFloat32(offset, true)} in JS). Encoded via
	 * {@link Float#floatToIntBits(float)} to avoid depending on
	 * {@code ByteBuffer.putFloat}.
	 *
	 * @param value the value
	 * @return this, for chaining
	 */
	public SceneCommandBuffer putFloat(float value)
	{
		return putInt(Float.floatToIntBits(value));
	}

	public SceneCommandBuffer putFloats(float[] values)
	{
		ensureCapacity(values.length * 4);
		for (float value : values)
		{
			buffer.putInt(Float.floatToIntBits(value));
		}
		return this;
	}

	public SceneCommandBuffer putShortValue(int value)
	{
		ensureCapacity(2);
		buffer.putShort((short) value);
		return this;
	}

	public SceneCommandBuffer putByte(int value)
	{
		ensureCapacity(1);
		buffer.put((byte) value);
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
			if (length < 0 || length > b.remaining())
			{
				throw new IllegalArgumentException("Corrupt scene command buffer: section "
					+ i + " length " + length + " exceeds remaining " + b.remaining());
			}
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
