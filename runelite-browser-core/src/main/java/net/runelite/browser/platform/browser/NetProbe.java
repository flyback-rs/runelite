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
import java.util.ArrayList;
import java.util.List;
import net.runelite.browser.platform.DuplexStream;
import net.runelite.browser.platform.GameEndpoint;
import net.runelite.browser.platform.Transport;

/**
 * A self-contained round-trip probe for the browser networking path. It opens a
 * {@link WebSocketDuplexStream} to a gateway, writes a byte payload, and reads the
 * reply, exposing a single string status the host page can poll. It exists so an
 * end-to-end test can drive the real WasmGC transport (worker → gateway → TCP)
 * without needing the full game protocol.
 *
 * <p>Status transitions: {@code "idle"} → {@code "pending"} →
 * {@code "ok:<b0>,<b1>,..."} on success, or {@code "error:<message>"} /
 * {@code "closed"} on failure.</p>
 */
public final class NetProbe
{
	private NetProbe()
	{
	}

	private static String status = "idle";
	private static DuplexStream stream;

	/**
	 * Starts a probe: connects to {@code gatewayUrl}, writes {@code message} (a
	 * comma-separated list of unsigned byte values), and reads back up to that many
	 * bytes.
	 *
	 * @param gatewayUrl the gateway base URL (e.g. {@code ws://127.0.0.1:8090})
	 * @param host the destination host to relay to
	 * @param port the destination port to relay to
	 * @param message comma-separated unsigned byte values to send
	 */
	public static void start(String gatewayUrl, String host, int port, String message)
	{
		status = "pending";
		try
		{
			byte[] payload = parse(message);
			BrowserPlatformNetwork network = new BrowserPlatformNetwork(gatewayUrl);
			stream = network.connect(new GameEndpoint(host, port, Transport.WSS));
			stream.write(ByteBuffer.wrap(payload));
			pump(ByteBuffer.allocate(Math.max(1, payload.length)), payload.length);
		}
		catch (RuntimeException e)
		{
			status = "error:" + e.getMessage();
		}
	}

	/**
	 * @return the current probe status, poll-able from JavaScript
	 */
	public static String result()
	{
		return status;
	}

	private static void pump(ByteBuffer dst, int expected)
	{
		stream.read(dst).onSuccess(n ->
		{
			if (n < 0)
			{
				status = dst.position() > 0 ? format(dst) : "closed";
			}
			else if (dst.position() >= expected || !dst.hasRemaining())
			{
				status = format(dst);
			}
			else
			{
				pump(dst, expected);
			}
		}).onFailure(err -> status = "error:" + err.getMessage());
	}

	private static String format(ByteBuffer dst)
	{
		int n = dst.position();
		StringBuilder sb = new StringBuilder("ok:");
		for (int i = 0; i < n; i++)
		{
			if (i > 0)
			{
				sb.append(',');
			}
			sb.append(dst.get(i) & 0xFF);
		}
		return sb.toString();
	}

	private static byte[] parse(String message)
	{
		if (message == null || message.isEmpty())
		{
			return new byte[0];
		}
		List<Byte> values = new ArrayList<>();
		int start = 0;
		for (int i = 0; i <= message.length(); i++)
		{
			if (i == message.length() || message.charAt(i) == ',')
			{
				if (i > start)
				{
					values.add((byte) (Integer.parseInt(message.substring(start, i)) & 0xFF));
				}
				start = i + 1;
			}
		}
		byte[] out = new byte[values.size()];
		for (int i = 0; i < out.length; i++)
		{
			out[i] = values.get(i);
		}
		return out;
	}
}
