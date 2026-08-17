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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class PanelModelTest
{
	@Test
	public void buildsComponentsInOrder()
	{
		PanelModel model = PanelModel.builder("demo", "Demo")
			.section("General")
			.label("Hello")
			.toggle("t", "Toggle", true)
			.slider("s", "Slider", 5)
			.build();
		assertEquals("demo", model.getPluginId());
		assertEquals("Demo", model.getTitle());
		assertEquals(4, model.getComponents().size());
		assertEquals(ComponentType.SECTION, model.getComponents().get(0).getType());
		assertEquals(ComponentType.TOGGLE, model.getComponents().get(2).getType());
		assertEquals("true", model.getComponents().get(2).getValue());
		assertEquals("5", model.getComponents().get(3).getValue());
	}

	@Test
	public void toJsonEscapesAndIncludesFields()
	{
		PanelModel model = PanelModel.builder("p", "Title \"q\"")
			.label("line1\nline2")
			.build();
		String json = model.toJson();
		assertTrue(json.contains("\"pluginId\":\"p\""));
		assertTrue(json.contains("\\\"q\\\""));
		assertTrue(json.contains("line1\\nline2"));
		assertTrue(json.contains("\"type\":\"LABEL\""));
		assertTrue(json.contains("\"id\":null"));
	}
}
