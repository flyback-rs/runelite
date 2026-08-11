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
 * Global holder for the installed {@link PlatformServices}. This is the seam the
 * rest of the port resolves platform capabilities through, deliberately without a
 * dependency-injection container so it compiles unchanged to WasmGC.
 *
 * <p>A host installs its services exactly once at start-up (the browser bootstrap
 * or {@code RuneLite.main}), after which any code can call {@link #storage()},
 * {@link #network()}, {@link #renderer()} or {@link #ui()}.</p>
 */
public final class Platform
{
	private static volatile PlatformServices services;

	private Platform()
	{
	}

	/**
	 * Installs the platform services for this host.
	 *
	 * @param platformServices the services to install; must not be {@code null}
	 */
	public static void install(PlatformServices platformServices)
	{
		if (platformServices == null)
		{
			throw new IllegalArgumentException("platformServices must not be null");
		}
		services = platformServices;
	}

	/**
	 * @return whether services have been installed
	 */
	public static boolean isInstalled()
	{
		return services != null;
	}

	/**
	 * @return the installed services
	 * @throws IllegalStateException if no services have been installed
	 */
	public static PlatformServices get()
	{
		PlatformServices current = services;
		if (current == null)
		{
			throw new IllegalStateException("Platform services have not been installed");
		}
		return current;
	}

	/**
	 * @return the network implementation
	 */
	public static PlatformNetwork network()
	{
		return get().network();
	}

	/**
	 * @return the storage implementation
	 */
	public static PlatformStorage storage()
	{
		return get().storage();
	}

	/**
	 * @return the renderer implementation
	 */
	public static PlatformRenderer renderer()
	{
		return get().renderer();
	}

	/**
	 * @return the UI implementation
	 */
	public static PlatformUi ui()
	{
		return get().ui();
	}

	/**
	 * Clears the installed services. Intended for tests.
	 */
	public static void reset()
	{
		services = null;
	}
}
