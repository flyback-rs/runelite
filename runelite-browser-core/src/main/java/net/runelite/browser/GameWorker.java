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
package net.runelite.browser;

import java.nio.ByteBuffer;
import net.runelite.browser.platform.SceneCommandBuffer;
import net.runelite.browser.scene.SceneReplaySource;
import org.teavm.jso.typedarrays.Int8Array;

/**
 * Game-worker logic driven from JavaScript through the {@link WasmEntry} facade.
 * {@link #init} is called once, then {@link #produceFrame} each tick to fill a
 * caller-provided {@code Int8Array} (a view over the next SharedArrayBuffer ring
 * slot) with a packed {@link SceneCommandBuffer} frame.
 *
 * <p>State is static because there is one Wasm module instance per worker.</p>
 */
public final class GameWorker
{
	/** Upper bound on a frame's byte size; the worker sizes ring slots to this. */
	private static final int FRAME_CAPACITY = 1 << 16;

	private static SceneReplaySource source;
	private static SceneCommandBuffer frame;

	private GameWorker()
	{
	}

	public static void init(int width, int height)
	{
		source = new SceneReplaySource(width, height);
		frame = new SceneCommandBuffer(FRAME_CAPACITY);
	}

	/**
	 * Updates the viewport so the projection aspect ratio tracks canvas resizes.
	 *
	 * @param width new viewport width
	 * @param height new viewport height
	 */
	public static void resize(int width, int height)
	{
		if (source != null)
		{
			source.resize(width, height);
		}
	}

	/**
	 * @return the maximum bytes {@link #produceFrame} can write, so JS can size
	 *         each ring slot to hold a whole frame
	 */
	public static int frameCapacity()
	{
		return FRAME_CAPACITY;
	}

	/**
	 * Fills {@code target} with the packed frame for {@code frameIndex}.
	 *
	 * @param target destination typed array (a view over a ring slot)
	 * @param frameIndex the frame number
	 * @return the number of bytes written
	 */
	public static int produceFrame(Int8Array target, int frameIndex)
	{
		source.fill(frame, frameIndex);
		ByteBuffer view = frame.finish();
		// Never write past the ring slot (a frame that outgrew FRAME_CAPACITY is
		// truncated to a valid length rather than corrupting the next slot).
		int length = Math.min(view.remaining(), target.getLength());
		// WasmGC has no zero-copy view between a Java byte[] and a JS typed array,
		// so this copies element-wise. It is only ever the small synthetic scene
		// frames; the real client renders through CheerpJ, not this path.
		for (int i = 0; i < length; i++)
		{
			target.set(i, view.get());
		}
		return length;
	}
}
