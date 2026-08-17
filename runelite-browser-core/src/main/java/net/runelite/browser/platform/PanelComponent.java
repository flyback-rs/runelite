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

/**
 * One immutable element of a {@link PanelModel}: a {@link ComponentType} plus an
 * optional id (for referencing it in later commands), display text, and an
 * initial value.
 */
public final class PanelComponent
{
	private final ComponentType type;
	private final String id;
	private final String text;
	private final String value;

	public PanelComponent(ComponentType type, String id, String text, String value)
	{
		if (type == null)
		{
			throw new IllegalArgumentException("type must not be null");
		}
		this.type = type;
		this.id = id;
		this.text = text;
		this.value = value;
	}

	public static PanelComponent label(String text)
	{
		return new PanelComponent(ComponentType.LABEL, null, text, null);
	}

	public static PanelComponent section(String text)
	{
		return new PanelComponent(ComponentType.SECTION, null, text, null);
	}

	public static PanelComponent button(String id, String text)
	{
		return new PanelComponent(ComponentType.BUTTON, id, text, null);
	}

	public static PanelComponent toggle(String id, String text, boolean on)
	{
		return new PanelComponent(ComponentType.TOGGLE, id, text, Boolean.toString(on));
	}

	public static PanelComponent slider(String id, String text, int value)
	{
		return new PanelComponent(ComponentType.SLIDER, id, text, Integer.toString(value));
	}

	public static PanelComponent textInput(String id, String text, String value)
	{
		return new PanelComponent(ComponentType.TEXT_INPUT, id, text, value);
	}

	public ComponentType getType()
	{
		return type;
	}

	public String getId()
	{
		return id;
	}

	public String getText()
	{
		return text;
	}

	public String getValue()
	{
		return value;
	}
}
