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

import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayDeque;
import java.util.Deque;
import net.runelite.browser.platform.AsyncResult;
import net.runelite.browser.platform.CompletableResult;
import net.runelite.browser.platform.DuplexStream;
import org.teavm.jso.dom.events.MessageEvent;
import org.teavm.jso.typedarrays.ArrayBuffer;
import org.teavm.jso.typedarrays.Int8Array;
import org.teavm.jso.websocket.WebSocket;

/**
 * A {@link DuplexStream} backed by a browser {@code WebSocket} in binary mode.
 *
 * <p>This is the browser's replacement for a raw TCP socket: it carries opaque
 * game bytes to a trusted gateway that relays them to {@code <world>:43594}. The
 * socket is asynchronous, so reads that arrive before data return a pending
 * {@link AsyncResult} completed from the {@code message} event, and writes issued
 * before the socket opens are queued and flushed on {@code open}.</p>
 *
 * <p>Only one read may be outstanding at a time, matching the single-consumer
 * pattern of the game's network thread. Instances are confined to one worker and
 * are not thread safe.</p>
 */
public final class WebSocketDuplexStream implements DuplexStream
{
	private final WebSocket socket;

	/** Received chunks not yet handed to a reader; {@link #headOffset} tracks partial consumption of the head. */
	private final Deque<byte[]> incoming = new ArrayDeque<>();
	private int headOffset;

	/** Writes issued before the socket opened, flushed in order on {@code open}. */
	private final Deque<byte[]> pendingWrites = new ArrayDeque<>();

	private boolean open;
	private boolean closed;
	private Throwable error;

	private CompletableResult<Integer> pendingRead;
	private ByteBuffer pendingDst;

	public WebSocketDuplexStream(String url)
	{
		this.socket = new WebSocket(url);
		this.socket.setBinaryType("arraybuffer");
		this.socket.onOpen(event -> onOpen());
		this.socket.onMessage(this::onMessage);
		this.socket.onClose(event -> onClose());
		this.socket.onError(event -> onError());
	}

	private void onOpen()
	{
		open = true;
		while (!pendingWrites.isEmpty())
		{
			sendNow(pendingWrites.pollFirst());
		}
	}

	private void onMessage(MessageEvent event)
	{
		ArrayBuffer buffer = event.getDataAsArray();
		if (buffer == null)
		{
			return;
		}
		Int8Array view = new Int8Array(buffer);
		int n = view.getLength();
		if (n == 0)
		{
			return;
		}
		byte[] chunk = new byte[n];
		for (int i = 0; i < n; i++)
		{
			chunk[i] = view.get(i);
		}
		incoming.addLast(chunk);
		fulfilPendingRead();
	}

	private void onClose()
	{
		open = false;
		closed = true;
		if (pendingRead != null && incoming.isEmpty())
		{
			CompletableResult<Integer> result = takePendingRead();
			result.complete(-1);
		}
	}

	private void onError()
	{
		if (error == null)
		{
			error = new IOException("WebSocket transport error");
		}
		if (pendingRead != null)
		{
			CompletableResult<Integer> result = takePendingRead();
			result.fail(error);
		}
	}

	@Override
	public AsyncResult<Integer> read(ByteBuffer dst)
	{
		if (pendingRead != null)
		{
			return CompletableResult.failed(new IllegalStateException("a read is already pending"));
		}
		if (!incoming.isEmpty())
		{
			return CompletableResult.completed(drainInto(dst));
		}
		if (error != null)
		{
			return CompletableResult.failed(error);
		}
		if (closed)
		{
			return CompletableResult.completed(-1);
		}
		CompletableResult<Integer> result = new CompletableResult<>();
		pendingRead = result;
		pendingDst = dst;
		return result;
	}

	@Override
	public AsyncResult<Void> write(ByteBuffer src)
	{
		if (closed || error != null)
		{
			return CompletableResult.failed(error != null ? error : new IOException("stream is closed"));
		}
		byte[] bytes = new byte[src.remaining()];
		src.get(bytes);
		if (open)
		{
			sendNow(bytes);
		}
		else
		{
			pendingWrites.addLast(bytes);
		}
		return CompletableResult.<Void>completed(null);
	}

	@Override
	public boolean isOpen()
	{
		return open && !closed;
	}

	@Override
	public void close()
	{
		if (!closed)
		{
			closed = true;
			open = false;
			socket.close();
		}
	}

	private void fulfilPendingRead()
	{
		if (pendingRead == null || incoming.isEmpty())
		{
			return;
		}
		int count = drainInto(pendingDst);
		CompletableResult<Integer> result = takePendingRead();
		result.complete(count);
	}

	private CompletableResult<Integer> takePendingRead()
	{
		CompletableResult<Integer> result = pendingRead;
		pendingRead = null;
		pendingDst = null;
		return result;
	}

	private int drainInto(ByteBuffer dst)
	{
		int total = 0;
		while (dst.hasRemaining() && !incoming.isEmpty())
		{
			byte[] head = incoming.peekFirst();
			int toCopy = Math.min(head.length - headOffset, dst.remaining());
			dst.put(head, headOffset, toCopy);
			headOffset += toCopy;
			total += toCopy;
			if (headOffset >= head.length)
			{
				incoming.pollFirst();
				headOffset = 0;
			}
		}
		return total;
	}

	private void sendNow(byte[] bytes)
	{
		// WasmGC has no bulk byte[] -> typed-array copy (that path needs an @Import
		// intrinsic), so the payload is copied element-wise; game frames are small.
		Int8Array view = new Int8Array(bytes.length);
		for (int i = 0; i < bytes.length; i++)
		{
			view.set(i, bytes[i]);
		}
		socket.send(view);
	}
}
