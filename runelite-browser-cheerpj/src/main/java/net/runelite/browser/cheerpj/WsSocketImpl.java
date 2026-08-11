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

import java.io.FileDescriptor;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.SocketAddress;
import java.net.SocketException;
import java.net.SocketImpl;
import java.net.SocketOptions;
import java.net.SocketTimeoutException;

/**
 * A {@link SocketImpl} that carries the client's game/JS5 traffic over a
 * WebSocket to the trusted gateway (via {@link WsBridge}), instead of CheerpJ's
 * built-in Tailscale transport. Installed globally by {@link WsSocketImplFactory}
 * so every {@code new java.net.Socket()} the client creates is relayed.
 *
 * <p>Only the client-connect path is implemented ({@code bind}/{@code listen}/
 * {@code accept} throw). The destination host is taken from the socket address's
 * {@link InetSocketAddress#getHostString() host string} rather than a resolved
 * {@link InetAddress}, so DNS is done by the gateway and never in the browser.</p>
 */
final class WsSocketImpl extends SocketImpl
{
	private final String gatewayUrl;
	private int handle = -1;
	private int soTimeout;
	private boolean closed;

	WsSocketImpl(String gatewayUrl)
	{
		this.gatewayUrl = gatewayUrl;
	}

	@Override
	protected void create(boolean stream) throws IOException
	{
		if (!stream)
		{
			throw new IOException("datagram sockets are not supported by the gateway");
		}
		this.fd = new FileDescriptor();
	}

	@Override
	protected void connect(String host, int port) throws IOException
	{
		open(host, port);
	}

	@Override
	protected void connect(InetAddress address, int port) throws IOException
	{
		open(address.getHostName(), port);
	}

	@Override
	protected void connect(SocketAddress address, int timeout) throws IOException
	{
		if (!(address instanceof InetSocketAddress))
		{
			throw new IOException("unsupported socket address: " + address);
		}
		InetSocketAddress isa = (InetSocketAddress) address;
		// getHostString() returns the literal hostname when present without
		// triggering a reverse lookup, so no browser-side DNS is needed.
		open(isa.getHostString(), isa.getPort());
	}

	private void open(String host, int port) throws IOException
	{
		// Diagnostic: proves the client's java.net.Socket routed through this impl.
		System.out.println("[WsSocketImpl] connect " + host + ":" + port);
		this.address = InetAddress.getByName("0.0.0.0");
		this.port = port;
		handle = WsBridge.nOpen(gatewayUrl, host, port);
		if (handle < 0)
		{
			throw new IOException("gateway connection to " + host + ":" + port + " failed");
		}
	}

	@Override
	protected InputStream getInputStream()
	{
		return new InputStream()
		{
			private final byte[] one = new byte[1];

			@Override
			public int read() throws IOException
			{
				int n = read(one, 0, 1);
				return n <= 0 ? -1 : one[0] & 0xff;
			}

			@Override
			public int read(byte[] b, int off, int len) throws IOException
			{
				if (len == 0)
				{
					return 0;
				}
				ensureOpen();
				int n = WsBridge.nRead(handle, b, off, len, soTimeout);
				if (n == WsBridge.TIMEOUT)
				{
					throw new SocketTimeoutException("read timed out");
				}
				return n;
			}

			@Override
			public int available()
			{
				return closed ? 0 : WsBridge.nAvailable(handle);
			}
		};
	}

	@Override
	protected OutputStream getOutputStream()
	{
		return new OutputStream()
		{
			private final byte[] one = new byte[1];

			@Override
			public void write(int b) throws IOException
			{
				one[0] = (byte) b;
				write(one, 0, 1);
			}

			@Override
			public void write(byte[] b, int off, int len) throws IOException
			{
				if (len == 0)
				{
					return;
				}
				ensureOpen();
				if (WsBridge.nWrite(handle, b, off, len) < 0)
				{
					throw new IOException("gateway write failed");
				}
			}
		};
	}

	@Override
	protected int available()
	{
		return closed ? 0 : WsBridge.nAvailable(handle);
	}

	@Override
	protected void close()
	{
		if (!closed)
		{
			closed = true;
			if (handle >= 0)
			{
				WsBridge.nClose(handle);
			}
		}
	}

	private void ensureOpen() throws IOException
	{
		if (closed || handle < 0)
		{
			throw new IOException("socket is closed");
		}
	}

	@Override
	protected void bind(InetAddress host, int port) throws IOException
	{
		throw new IOException("bind is not supported by the gateway");
	}

	@Override
	protected void listen(int backlog) throws IOException
	{
		throw new IOException("listen is not supported by the gateway");
	}

	@Override
	protected void accept(SocketImpl s) throws IOException
	{
		throw new IOException("accept is not supported by the gateway");
	}

	@Override
	protected void sendUrgentData(int data) throws IOException
	{
		throw new IOException("urgent data is not supported by the gateway");
	}

	@Override
	public void setOption(int optID, Object value) throws SocketException
	{
		if (optID == SocketOptions.SO_TIMEOUT)
		{
			soTimeout = ((Number) value).intValue();
		}
		// Other options (TCP_NODELAY, SO_LINGER, buffer sizes...) are accepted and
		// ignored: the relay handles framing/flushing, so they have no analogue.
	}

	@Override
	public Object getOption(int optID) throws SocketException
	{
		switch (optID)
		{
			case SocketOptions.SO_TIMEOUT:
				return soTimeout;
			case SocketOptions.TCP_NODELAY:
			case SocketOptions.SO_KEEPALIVE:
			case SocketOptions.SO_REUSEADDR:
				return Boolean.TRUE;
			default:
				return null;
		}
	}
}
