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
package net.runelite.browser.cheerpj;

/**
 * The native bridge to the JavaScript WebSocket relay. Each method is implemented
 * in JavaScript (see the {@code natives} passed to {@code cheerpjInit} in
 * boot.js) and matched by CheerpJ on the {@code Java_<fqcn>_<method>} name. A Java
 * {@code byte[]} arrives on the JS side as an {@code Int8Array} over the same
 * memory (CheerpJ passes primitive arrays by reference), so reads fill the
 * caller's buffer directly.
 *
 * <p>These calls are synchronous from Java's point of view: the JS side returns a
 * {@code Promise} and CheerpJ suspends the calling Java thread until it resolves,
 * which is exactly the blocking-socket semantics the client expects.</p>
 */
final class WsBridge
{
	/** {@link #nRead} sentinel: the read timed out (SO_TIMEOUT elapsed). */
	static final int TIMEOUT = -2;
	/** {@link #nRead} sentinel: end of stream. */
	static final int EOF = -1;

	private WsBridge()
	{
	}

	/**
	 * Opens a relayed connection to {@code host:port} through the gateway.
	 *
	 * @param gatewayUrl the gateway base URL (e.g. {@code ws://127.0.0.1:8090})
	 * @param host the destination host
	 * @param port the destination port
	 * @return a positive handle, or a negative value on failure
	 */
	static native int nOpen(String gatewayUrl, String host, int port);

	/**
	 * Blocks until at least one byte is available, then copies up to {@code len}
	 * bytes into {@code buffer} starting at {@code offset}.
	 *
	 * @param handle the connection handle
	 * @param buffer the destination (arrives in JS as an Int8Array by reference)
	 * @param offset the start offset in {@code buffer}
	 * @param len the maximum number of bytes to read
	 * @param timeoutMs the read timeout in ms, or 0 to block indefinitely
	 * @return the number of bytes read, {@link #EOF} at end of stream, or
	 *         {@link #TIMEOUT} if the timeout elapsed first
	 */
	static native int nRead(int handle, byte[] buffer, int offset, int len, int timeoutMs);

	/**
	 * Sends {@code len} bytes from {@code buffer} (blocking until queued to the
	 * socket).
	 *
	 * @param handle the connection handle
	 * @param buffer the source (arrives in JS as an Int8Array by reference)
	 * @param offset the start offset in {@code buffer}
	 * @param len the number of bytes to send
	 * @return 0 on success, negative on failure
	 */
	static native int nWrite(int handle, byte[] buffer, int offset, int len);

	/**
	 * @param handle the connection handle
	 * @return the number of buffered bytes immediately readable without blocking
	 */
	static native int nAvailable(int handle);

	/**
	 * Closes the connection and releases its handle.
	 *
	 * @param handle the connection handle
	 */
	static native void nClose(int handle);
}
