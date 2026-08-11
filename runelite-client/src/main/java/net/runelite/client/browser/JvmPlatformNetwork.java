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
package net.runelite.client.browser;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.ByteBuffer;
import lombok.extern.slf4j.Slf4j;
import net.runelite.browser.platform.AsyncResult;
import net.runelite.browser.platform.CompletableResult;
import net.runelite.browser.platform.DuplexStream;
import net.runelite.browser.platform.GameEndpoint;
import net.runelite.browser.platform.PlatformNetwork;

/**
 * Desktop {@link PlatformNetwork} over blocking TCP sockets. The browser has no
 * equivalent (raw sockets are unavailable), which is exactly why the seam exists:
 * the browser implementation tunnels through a gateway instead.
 */
public class JvmPlatformNetwork implements PlatformNetwork
{
	@Override
	public DuplexStream connect(GameEndpoint endpoint)
	{
		try
		{
			Socket socket = new Socket();
			socket.connect(new InetSocketAddress(endpoint.getHost(), endpoint.getPort()));
			return new SocketDuplexStream(socket);
		}
		catch (IOException e)
		{
			throw new IllegalStateException("Unable to connect to " + endpoint, e);
		}
	}

	@Slf4j
	private static final class SocketDuplexStream implements DuplexStream
	{
		private final Socket socket;
		private final InputStream in;
		private final OutputStream out;

		SocketDuplexStream(Socket socket) throws IOException
		{
			this.socket = socket;
			this.in = socket.getInputStream();
			this.out = socket.getOutputStream();
		}

		@Override
		public AsyncResult<Integer> read(ByteBuffer dst)
		{
			try
			{
				byte[] tmp = new byte[dst.remaining()];
				int n = in.read(tmp);
				if (n > 0)
				{
					dst.put(tmp, 0, n);
				}
				return CompletableResult.completed(n);
			}
			catch (IOException e)
			{
				return CompletableResult.failed(e);
			}
		}

		@Override
		public AsyncResult<Void> write(ByteBuffer src)
		{
			try
			{
				byte[] tmp = new byte[src.remaining()];
				src.get(tmp);
				out.write(tmp);
				out.flush();
				return CompletableResult.completed(null);
			}
			catch (IOException e)
			{
				return CompletableResult.failed(e);
			}
		}

		@Override
		public boolean isOpen()
		{
			return socket.isConnected() && !socket.isClosed();
		}

		@Override
		public void close()
		{
			try
			{
				socket.close();
			}
			catch (IOException e)
			{
				log.debug("error closing socket", e);
			}
		}
	}
}
