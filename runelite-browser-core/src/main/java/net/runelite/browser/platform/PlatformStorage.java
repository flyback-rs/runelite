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

/**
 * Key/value blob storage. The desktop implementation is backed by files under
 * {@code ~/.runelite}; the browser implementation is backed by {@code localStorage}
 * (and, in later parts, IndexedDB or OPFS for larger blobs such as the cache).
 */
public interface PlatformStorage
{
	/**
	 * Reads the blob stored under {@code key}.
	 *
	 * @param key the key
	 * @return the stored bytes, or {@code null} if the key is absent
	 */
	AsyncResult<ByteBuffer> read(String key);

	/**
	 * Writes {@code data} under {@code key}, replacing any existing value. The
	 * remaining bytes of {@code data} are stored.
	 *
	 * @param key the key
	 * @param data the bytes to store
	 * @return a result completing when the write is durable
	 */
	AsyncResult<Void> write(String key, ByteBuffer data);

	/**
	 * Removes any blob stored under {@code key}.
	 *
	 * @param key the key
	 * @return a result completing when the key is removed
	 */
	AsyncResult<Void> delete(String key);
}
