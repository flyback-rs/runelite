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
package net.runelite.client.browser;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import net.runelite.browser.platform.AsyncResult;
import net.runelite.browser.platform.CompletableResult;
import net.runelite.browser.platform.PlatformStorage;

/**
 * Desktop {@link PlatformStorage} backed by files under the RuneLite directory
 * (usually {@code ~/.runelite}). This is the reference implementation that proves
 * the platform seam against real RuneLite persistence; the browser equivalent is
 * {@code net.runelite.browser.platform.browser.BrowserPlatformStorage} over
 * {@code localStorage}.
 */
public class JvmPlatformStorage implements PlatformStorage
{
	private final File baseDir;

	public JvmPlatformStorage(File runeliteDir)
	{
		this.baseDir = new File(runeliteDir, "browser-storage");
	}

	private File fileFor(String key)
	{
		String safe = key.replaceAll("[^a-zA-Z0-9._-]", "_");
		return new File(baseDir, safe);
	}

	@Override
	public AsyncResult<ByteBuffer> read(String key)
	{
		File file = fileFor(key);
		if (!file.exists())
		{
			return CompletableResult.completed(null);
		}
		try
		{
			return CompletableResult.completed(ByteBuffer.wrap(Files.readAllBytes(file.toPath())));
		}
		catch (IOException e)
		{
			return CompletableResult.failed(e);
		}
	}

	@Override
	public AsyncResult<Void> write(String key, ByteBuffer data)
	{
		File file = fileFor(key);
		try
		{
			if (!baseDir.exists() && !baseDir.mkdirs())
			{
				throw new IOException("Unable to create storage directory " + baseDir);
			}
			byte[] bytes = new byte[data.remaining()];
			data.get(bytes);
			Files.write(file.toPath(), bytes);
			return CompletableResult.completed(null);
		}
		catch (IOException e)
		{
			return CompletableResult.failed(e);
		}
	}

	@Override
	public AsyncResult<Void> delete(String key)
	{
		File file = fileFor(key);
		if (file.exists() && !file.delete())
		{
			return CompletableResult.failed(new IOException("Unable to delete " + file));
		}
		return CompletableResult.completed(null);
	}
}
