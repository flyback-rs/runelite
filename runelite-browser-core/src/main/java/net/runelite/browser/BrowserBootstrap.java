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
package net.runelite.browser;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import net.runelite.browser.platform.Platform;
import net.runelite.browser.platform.PanelModel;
import net.runelite.browser.platform.SceneCommandBuffer;
import net.runelite.browser.platform.browser.BrowserPlatformServices;

/**
 * WasmGC entry point for the browser core. It installs the browser
 * {@link net.runelite.browser.platform.PlatformServices}, then exercises the seam
 * end to end so a page loading the module gets visible proof that the Wasm/JS/DOM
 * boundary works: a {@code localStorage} round-trip, a scene submission, and a
 * declarative panel published to the DOM.
 */
public final class BrowserBootstrap
{
	private static final String PROBE_KEY = "runelite-browser.bootstrap.probe";

	private BrowserBootstrap()
	{
	}

	public static void main(String[] args)
	{
		Platform.install(new BrowserPlatformServices());

		String message = "RuneLite browser core online";
		ByteBuffer data = ByteBuffer.wrap(message.getBytes(StandardCharsets.UTF_8));

		String[] roundTrip = {"(pending)"};
		Platform.storage().write(PROBE_KEY, data);
		Platform.storage().read(PROBE_KEY).onSuccess(read -> roundTrip[0] = decode(read));

		SceneCommandBuffer scene = new SceneCommandBuffer();
		scene.putSection(SceneCommandBuffer.SECTION_OVERLAY_QUADS, 1, new byte[]{0, 0, 0, 0});
		scene.finish();
		Platform.renderer().submitScene(scene);

		PanelModel model = PanelModel.builder("runelite-browser", "RuneLite Browser Core")
			.section("Platform seam")
			.label("WasmGC module booted successfully.")
			.label("Storage round-trip: " + roundTrip[0])
			.toggle("demo.toggle", "Demo toggle", true)
			.slider("demo.slider", "Demo slider", 42)
			.button("demo.button", "Demo button")
			.build();

		Platform.ui().publishPanelModel("runelite-browser", model);
	}

	private static String decode(ByteBuffer buffer)
	{
		if (buffer == null)
		{
			return "(absent)";
		}
		byte[] bytes = new byte[buffer.remaining()];
		buffer.get(bytes);
		return new String(bytes, StandardCharsets.UTF_8);
	}
}
