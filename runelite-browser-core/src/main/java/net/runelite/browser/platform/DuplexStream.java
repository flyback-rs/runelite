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
 * A bidirectional byte stream, the platform-neutral replacement for a
 * {@link java.net.Socket}. Reads and writes are asynchronous so the same
 * interface works over a JVM socket, a browser {@code WebSocket}, or
 * {@code WebTransport}.
 */
public interface DuplexStream
{
	/**
	 * Reads available bytes into {@code dst}.
	 *
	 * @param dst the destination buffer
	 * @return the number of bytes read, or {@code -1} at end of stream
	 */
	AsyncResult<Integer> read(ByteBuffer dst);

	/**
	 * Writes the remaining bytes of {@code src}.
	 *
	 * @param src the source buffer
	 * @return a result completing when the bytes have been accepted
	 */
	AsyncResult<Void> write(ByteBuffer src);

	/**
	 * @return whether the stream is currently open
	 */
	boolean isOpen();

	/**
	 * Closes the stream, releasing its resources.
	 */
	void close();
}
