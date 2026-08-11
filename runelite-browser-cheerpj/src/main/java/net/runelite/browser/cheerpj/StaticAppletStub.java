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

import java.applet.Applet;
import java.applet.AppletContext;
import java.applet.AppletStub;
import java.applet.AudioClip;
import java.awt.Image;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.Collections;
import java.util.Enumeration;
import java.util.Iterator;
import java.util.Map;

/**
 * The {@link AppletStub}/{@link AppletContext} the vanilla client applet runs
 * against, replacing the browser plugin: parameters come from the fetched
 * {@code jav_config.ws} and everything else is a benign no-op.
 */
final class StaticAppletStub implements AppletStub, AppletContext
{
	private final Applet applet;
	private final URL codeBase;
	private final URL documentBase;
	private final Map<String, String> parameters;

	StaticAppletStub(Applet applet, URL codeBase, URL documentBase, Map<String, String> parameters)
	{
		this.applet = applet;
		this.codeBase = codeBase;
		this.documentBase = documentBase;
		this.parameters = parameters;
	}

	@Override
	public boolean isActive()
	{
		return true;
	}

	@Override
	public URL getDocumentBase()
	{
		return documentBase;
	}

	@Override
	public URL getCodeBase()
	{
		return codeBase;
	}

	@Override
	public String getParameter(String name)
	{
		return parameters.get(name);
	}

	@Override
	public AppletContext getAppletContext()
	{
		return this;
	}

	@Override
	public void appletResize(int width, int height)
	{
		applet.setSize(width, height);
	}

	@Override
	public AudioClip getAudioClip(URL url)
	{
		return null;
	}

	@Override
	public Image getImage(URL url)
	{
		return null;
	}

	@Override
	public Applet getApplet(String name)
	{
		return null;
	}

	@Override
	public Enumeration<Applet> getApplets()
	{
		return Collections.emptyEnumeration();
	}

	@Override
	public void showDocument(URL url)
	{
	}

	@Override
	public void showDocument(URL url, String target)
	{
	}

	@Override
	public void showStatus(String status)
	{
	}

	@Override
	public void setStream(String key, InputStream stream) throws IOException
	{
	}

	@Override
	public InputStream getStream(String key)
	{
		return null;
	}

	@Override
	public Iterator<String> getStreamKeys()
	{
		return Collections.<String>emptyList().iterator();
	}
}
