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

import net.runelite.browser.platform.PlatformNetwork;
import net.runelite.browser.platform.PlatformRenderer;
import net.runelite.browser.platform.PlatformServices;
import net.runelite.browser.platform.PlatformStorage;
import net.runelite.browser.platform.PlatformUi;

/**
 * The browser bundle of {@link PlatformServices}, installed by
 * {@link net.runelite.browser.BrowserBootstrap}.
 */
public final class BrowserPlatformServices implements PlatformServices
{
	private final PlatformNetwork network = new BrowserPlatformNetwork();
	private final PlatformStorage storage = new BrowserPlatformStorage();
	private final PlatformRenderer renderer = new BrowserPlatformRenderer();
	private final PlatformUi ui = new BrowserPlatformUi();

	@Override
	public PlatformNetwork network()
	{
		return network;
	}

	@Override
	public PlatformStorage storage()
	{
		return storage;
	}

	@Override
	public PlatformRenderer renderer()
	{
		return renderer;
	}

	@Override
	public PlatformUi ui()
	{
		return ui;
	}
}
