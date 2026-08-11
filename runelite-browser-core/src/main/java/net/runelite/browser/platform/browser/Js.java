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

import org.teavm.jso.JSBody;

/**
 * Thin JavaScript interop helpers used by the browser platform implementations.
 * Each method is compiled by TeaVM into a direct call to the given JS snippet;
 * these are the only points where the WasmGC module touches the browser host.
 */
final class Js
{
	private Js()
	{
	}

	@JSBody(params = {"key"}, script = "return window.localStorage.getItem(key);")
	static native String localStorageGet(String key);

	@JSBody(params = {"key", "value"}, script = "window.localStorage.setItem(key, value);")
	static native void localStorageSet(String key, String value);

	@JSBody(params = {"key"}, script = "window.localStorage.removeItem(key);")
	static native void localStorageRemove(String key);

	@JSBody(params = {"pluginId", "json"}, script =
		"if (typeof window.runelitePublishPanel === 'function') { window.runelitePublishPanel(pluginId, json); }")
	static native void publishPanel(String pluginId, String json);

	@JSBody(params = {"message"}, script = "if (window.console) { window.console.log(message); }")
	static native void consoleLog(String message);

	@JSBody(params = {}, script =
		"return (typeof self !== 'undefined' && self.runeliteGatewayUrl) ? self.runeliteGatewayUrl : '';")
	static native String gatewayBase();
}
