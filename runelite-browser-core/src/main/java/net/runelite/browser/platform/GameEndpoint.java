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

import java.util.Objects;

/**
 * An immutable description of a game/cache endpoint to connect to: a host, a
 * port, and the {@link Transport} used to reach it.
 */
public final class GameEndpoint
{
	private final String host;
	private final int port;
	private final Transport transport;

	public GameEndpoint(String host, int port, Transport transport)
	{
		this.host = Objects.requireNonNull(host, "host");
		this.port = port;
		this.transport = Objects.requireNonNull(transport, "transport");
	}

	public String getHost()
	{
		return host;
	}

	public int getPort()
	{
		return port;
	}

	public Transport getTransport()
	{
		return transport;
	}

	@Override
	public boolean equals(Object o)
	{
		if (this == o)
		{
			return true;
		}
		if (!(o instanceof GameEndpoint))
		{
			return false;
		}
		GameEndpoint that = (GameEndpoint) o;
		return port == that.port && host.equals(that.host) && transport == that.transport;
	}

	@Override
	public int hashCode()
	{
		return Objects.hash(host, port, transport);
	}

	@Override
	public String toString()
	{
		return transport + "://" + host + ":" + port;
	}
}
