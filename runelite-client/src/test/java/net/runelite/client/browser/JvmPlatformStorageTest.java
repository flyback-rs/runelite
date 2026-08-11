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

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class JvmPlatformStorageTest
{
	@Rule
	public final TemporaryFolder folder = new TemporaryFolder();

	@Test
	public void writeThenReadRoundTrips()
	{
		JvmPlatformStorage storage = new JvmPlatformStorage(folder.getRoot());
		byte[] payload = "hello platform".getBytes(StandardCharsets.UTF_8);

		String[] error = {null};
		storage.write("profile.blob", ByteBuffer.wrap(payload)).onFailure(e -> error[0] = e.toString());
		assertNull(error[0]);

		ByteBuffer[] result = {null};
		storage.read("profile.blob").onSuccess(b -> result[0] = b);
		assertEquals("hello platform", asString(result[0]));
	}

	@Test
	public void readMissingKeyReturnsNull()
	{
		JvmPlatformStorage storage = new JvmPlatformStorage(folder.getRoot());
		Object[] holder = {"unset"};
		storage.read("absent").onSuccess(b -> holder[0] = b);
		assertNull(holder[0]);
	}

	@Test
	public void deleteRemovesKey()
	{
		JvmPlatformStorage storage = new JvmPlatformStorage(folder.getRoot());
		storage.write("k", ByteBuffer.wrap(new byte[]{1, 2, 3}));
		storage.delete("k");
		Object[] holder = {"unset"};
		storage.read("k").onSuccess(b -> holder[0] = b);
		assertNull(holder[0]);
	}

	private static String asString(ByteBuffer buffer)
	{
		byte[] bytes = new byte[buffer.remaining()];
		buffer.get(bytes);
		return new String(bytes, StandardCharsets.UTF_8);
	}
}
