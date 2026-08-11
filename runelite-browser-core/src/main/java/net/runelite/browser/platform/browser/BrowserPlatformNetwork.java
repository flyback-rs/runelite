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

import net.runelite.browser.platform.DuplexStream;
import net.runelite.browser.platform.GameEndpoint;
import net.runelite.browser.platform.PlatformNetwork;
import net.runelite.browser.platform.Transport;

/**
 * Browser {@link PlatformNetwork}. Browsers cannot open raw TCP sockets, so every
 * connection is tunnelled through a trusted gateway as a binary {@code WebSocket}:
 * the gateway is a blind byte relay that forwards the stream to the game world's
 * TCP port. The gateway base URL comes from the {@code self.runeliteGatewayUrl}
 * global set by the shell, or is supplied explicitly (used by the network probe).
 */
public final class BrowserPlatformNetwork implements PlatformNetwork
{
	private final String gatewayBase;

	public BrowserPlatformNetwork()
	{
		this(Js.gatewayBase());
	}

	public BrowserPlatformNetwork(String gatewayBase)
	{
		this.gatewayBase = gatewayBase;
	}

	@Override
	public DuplexStream connect(GameEndpoint endpoint)
	{
		if (endpoint.getTransport() == Transport.TCP)
		{
			throw new UnsupportedOperationException(
				"Direct TCP is not available in the browser; a WSS gateway is required");
		}
		if (gatewayBase == null || gatewayBase.isEmpty())
		{
			throw new IllegalStateException(
				"No gateway configured; set self.runeliteGatewayUrl before connecting");
		}
		return new WebSocketDuplexStream(buildUrl(gatewayBase, endpoint.getHost(), endpoint.getPort()));
	}

	/** Builds the gateway connect URL: {@code <base>/connect?host=<host>&port=<port>}. */
	static String buildUrl(String base, String host, int port)
	{
		String trimmed = base;
		while (trimmed.endsWith("/"))
		{
			trimmed = trimmed.substring(0, trimmed.length() - 1);
		}
		return trimmed + "/connect?host=" + host + "&port=" + port;
	}
}
