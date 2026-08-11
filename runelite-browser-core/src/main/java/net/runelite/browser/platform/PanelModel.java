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

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * A declarative description of a plugin side panel: an ordered list of
 * {@link PanelComponent}s under a title. The shell renders it however it likes.
 *
 * <p>{@link #toJson()} produces a compact JSON string so the model can cross the
 * Wasm/JS boundary as a single value rather than as a tree of interop objects.
 * The serializer is hand written to keep this module free of any JSON dependency
 * (and therefore trivially compilable to WasmGC).</p>
 */
public final class PanelModel
{
	private final String pluginId;
	private final String title;
	private final List<PanelComponent> components;

	private PanelModel(String pluginId, String title, List<PanelComponent> components)
	{
		this.pluginId = pluginId;
		this.title = title;
		this.components = Collections.unmodifiableList(new ArrayList<>(components));
	}

	public static Builder builder(String pluginId, String title)
	{
		return new Builder(pluginId, title);
	}

	public String getPluginId()
	{
		return pluginId;
	}

	public String getTitle()
	{
		return title;
	}

	public List<PanelComponent> getComponents()
	{
		return components;
	}

	/**
	 * @return a compact JSON representation of this model
	 */
	public String toJson()
	{
		StringBuilder sb = new StringBuilder(64);
		sb.append('{');
		appendField(sb, "pluginId", pluginId);
		sb.append(',');
		appendField(sb, "title", title);
		sb.append(",\"components\":[");
		for (int i = 0; i < components.size(); i++)
		{
			if (i > 0)
			{
				sb.append(',');
			}
			PanelComponent component = components.get(i);
			sb.append('{');
			appendField(sb, "type", component.getType().name());
			sb.append(',');
			appendField(sb, "id", component.getId());
			sb.append(',');
			appendField(sb, "text", component.getText());
			sb.append(',');
			appendField(sb, "value", component.getValue());
			sb.append('}');
		}
		sb.append("]}");
		return sb.toString();
	}

	private static void appendField(StringBuilder sb, String name, String value)
	{
		appendString(sb, name);
		sb.append(':');
		if (value == null)
		{
			sb.append("null");
		}
		else
		{
			appendString(sb, value);
		}
	}

	private static void appendString(StringBuilder sb, String value)
	{
		sb.append('"');
		for (int i = 0; i < value.length(); i++)
		{
			char c = value.charAt(i);
			switch (c)
			{
				case '"':
					sb.append("\\\"");
					break;
				case '\\':
					sb.append("\\\\");
					break;
				case '\n':
					sb.append("\\n");
					break;
				case '\r':
					sb.append("\\r");
					break;
				case '\t':
					sb.append("\\t");
					break;
				default:
					if (c < 0x20)
					{
						sb.append("\\u");
						String hex = Integer.toHexString(c);
						for (int pad = hex.length(); pad < 4; pad++)
						{
							sb.append('0');
						}
						sb.append(hex);
					}
					else
					{
						sb.append(c);
					}
					break;
			}
		}
		sb.append('"');
	}

	/**
	 * Fluent builder for {@link PanelModel}.
	 */
	public static final class Builder
	{
		private final String pluginId;
		private final String title;
		private final List<PanelComponent> components = new ArrayList<>();

		private Builder(String pluginId, String title)
		{
			this.pluginId = pluginId;
			this.title = title;
		}

		public Builder add(PanelComponent component)
		{
			components.add(component);
			return this;
		}

		public Builder label(String text)
		{
			return add(PanelComponent.label(text));
		}

		public Builder section(String text)
		{
			return add(PanelComponent.section(text));
		}

		public Builder button(String id, String text)
		{
			return add(PanelComponent.button(id, text));
		}

		public Builder toggle(String id, String text, boolean on)
		{
			return add(PanelComponent.toggle(id, text, on));
		}

		public Builder slider(String id, String text, int value)
		{
			return add(PanelComponent.slider(id, text, value));
		}

		public Builder textInput(String id, String text, String value)
		{
			return add(PanelComponent.textInput(id, text, value));
		}

		public PanelModel build()
		{
			return new PanelModel(pluginId, title, components);
		}
	}
}
