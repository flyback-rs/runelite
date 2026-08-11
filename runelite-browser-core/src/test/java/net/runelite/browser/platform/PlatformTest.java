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

import java.nio.ByteBuffer;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import org.junit.After;
import org.junit.Test;

public class PlatformTest
{
	@After
	public void tearDown()
	{
		Platform.reset();
	}

	@Test
	public void getThrowsWhenNotInstalled()
	{
		Platform.reset();
		assertFalse(Platform.isInstalled());
		try
		{
			Platform.get();
			fail("expected IllegalStateException");
		}
		catch (IllegalStateException expected)
		{
			// expected
		}
	}

	@Test
	public void installExposesServices()
	{
		PlatformServices services = new TestServices();
		Platform.install(services);
		assertTrue(Platform.isInstalled());
		assertSame(services, Platform.get());
		assertSame(services.storage(), Platform.storage());
	}

	@Test(expected = IllegalArgumentException.class)
	public void installRejectsNull()
	{
		Platform.install(null);
	}

	private static final class TestServices implements PlatformServices
	{
		private final PlatformStorage storage = new NoopStorage();

		@Override
		public PlatformNetwork network()
		{
			return null;
		}

		@Override
		public PlatformStorage storage()
		{
			return storage;
		}

		@Override
		public PlatformRenderer renderer()
		{
			return null;
		}

		@Override
		public PlatformUi ui()
		{
			return null;
		}
	}

	private static final class NoopStorage implements PlatformStorage
	{
		@Override
		public AsyncResult<ByteBuffer> read(String key)
		{
			return CompletableResult.completed(null);
		}

		@Override
		public AsyncResult<Void> write(String key, ByteBuffer data)
		{
			return CompletableResult.completed(null);
		}

		@Override
		public AsyncResult<Void> delete(String key)
		{
			return CompletableResult.completed(null);
		}
	}
}
