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

import org.teavm.jso.JSExport;
import org.teavm.jso.typedarrays.Int8Array;

/**
 * The WasmGC module's single entry facade. TeaVM only emits {@code @JSExport}
 * bindings for the configured main class, so every JavaScript-callable function
 * lives here and delegates to the real implementation.
 *
 * <p>{@link #main} runs part 1's browser bootstrap demo (kept so the standalone
 * page still works); the {@code game*} exports are the game worker's API and run
 * without {@link #main} ever being called.</p>
 */
public final class WasmEntry
{
	private WasmEntry()
	{
	}

	public static void main(String[] args)
	{
		BrowserBootstrap.main(args);
	}

	@JSExport
	public static void gameInit(int width, int height)
	{
		GameWorker.init(width, height);
	}

	@JSExport
	public static int gameFrameCapacity()
	{
		return GameWorker.frameCapacity();
	}

	@JSExport
	public static int gameProduceFrame(Int8Array target, int frameIndex)
	{
		return GameWorker.produceFrame(target, frameIndex);
	}
}
