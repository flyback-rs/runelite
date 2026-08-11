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
package net.runelite.browser.platform.browser;

import java.nio.ByteBuffer;
import java.util.Base64;
import net.runelite.browser.platform.AsyncResult;
import net.runelite.browser.platform.CompletableResult;
import net.runelite.browser.platform.PlatformStorage;

/**
 * {@link PlatformStorage} backed by the browser's {@code localStorage}. Blobs are
 * Base64 encoded because {@code localStorage} only stores strings. This is the
 * simplest durable store available synchronously; later parts of the port move
 * large blobs (such as the game cache) to IndexedDB or OPFS.
 */
public final class BrowserPlatformStorage implements PlatformStorage
{
	@Override
	public AsyncResult<ByteBuffer> read(String key)
	{
		String encoded = Js.localStorageGet(key);
		if (encoded == null)
		{
			return CompletableResult.completed(null);
		}
		byte[] bytes = Base64.getDecoder().decode(encoded);
		return CompletableResult.completed(ByteBuffer.wrap(bytes));
	}

	@Override
	public AsyncResult<Void> write(String key, ByteBuffer data)
	{
		byte[] bytes = new byte[data.remaining()];
		data.get(bytes);
		Js.localStorageSet(key, Base64.getEncoder().encodeToString(bytes));
		return CompletableResult.completed(null);
	}

	@Override
	public AsyncResult<Void> delete(String key)
	{
		Js.localStorageRemove(key);
		return CompletableResult.completed(null);
	}
}
