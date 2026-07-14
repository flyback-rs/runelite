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
import java.awt.BorderLayout;
import java.awt.Frame;
import java.awt.event.MouseEvent;
import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Proxy;
import java.net.Socket;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.HashMap;
import java.util.Map;

/**
 * Boots the real Old School RuneScape client inside CheerpJ. The page loads
 * this jar with {@code cheerpjRunLibrary} and calls one of the {@code boot*}
 * entry points; the client jars themselves are loaded reflectively from the
 * CheerpJ virtual filesystem so this shim has no compile-time dependency on
 * them.
 *
 * <p>Two boot modes, mirroring RuneLite's own {@code ClientLoader}:</p>
 * <ul>
 * <li>{@link #bootVanilla}: the unmodified gamepack, driven as the applet it
 * is — {@code setStub} with the {@code jav_config.ws} parameters, then
 * {@code init()}/{@code start()}.</li>
 * <li>{@link #bootInjected}: RuneLite's injected client, which replaces the
 * applet plumbing with {@code Client.setConfiguration(ClientConfiguration)}
 * (implemented here as a reflective proxy) followed by {@code initialize()}.</li>
 * </ul>
 *
 * <p>Progress is observable from JavaScript via {@link #phase()}.</p>
 */
public final class BrowserBoot
{
	private static volatile String phase = "idle";
	private static Applet applet;
	private static boolean gatewayInstalled;

	private BrowserBoot()
	{
	}

	/**
	 * @return the current boot phase, poll-able from JavaScript
	 */
	public static String phase()
	{
		return phase;
	}

	/**
	 * Routes every {@code java.net.Socket} the client opens through the gateway
	 * (see {@link WsSocketImpl}), the alternative to CheerpJ's Tailscale transport.
	 * A no-op when {@code gatewayUrl} is empty (falls back to CheerpJ networking).
	 *
	 * @param gatewayUrl the gateway base WebSocket URL, or empty/null to skip
	 */
	public static void installGateway(String gatewayUrl)
	{
		if (gatewayUrl == null || gatewayUrl.isEmpty() || gatewayInstalled)
		{
			return;
		}
		try
		{
			Socket.setSocketImplFactory(new WsSocketImplFactory(gatewayUrl));
			gatewayInstalled = true;
		}
		catch (Throwable t)
		{
			// If a factory is already set (e.g. by the runtime) it cannot be
			// replaced; surface it rather than silently using another transport.
			phase = "gateway-error:" + describe(t);
		}
	}

	/**
	 * Boots the unmodified gamepack as an applet.
	 *
	 * @param jarPath virtual-filesystem path of the gamepack jar
	 * @param codebase the jav_config codebase URL
	 * @param params applet parameters, {@code key\tvalue} pairs separated by {@code \n}
	 * @param width initial applet width
	 * @param height initial applet height
	 * @return "ok" or "error:..." (also reflected in {@link #phase()})
	 */
	public static String bootVanilla(String jarPath, String codebase, String params, int width, int height)
	{
		try
		{
			phase = "loading-jar";
			URLClassLoader loader = classLoader(jarPath);
			Class<?> clientClass = loader.loadClass("client");
			phase = "instantiating";
			Applet client = (Applet) clientClass.getDeclaredConstructor().newInstance();
			URL codeBase = new URL(codebase);
			client.setStub(new StaticAppletStub(client, codeBase, codeBase, parse(params)));
			show(client, width, height);
			phase = "applet-init";
			client.init();
			client.start();
			phase = "started";
			return "ok";
		}
		catch (Throwable t)
		{
			phase = "error:" + describe(t);
			return phase;
		}
	}

	/**
	 * Boots RuneLite's injected client ({@code injected-client.jar} +
	 * {@code runelite-api.jar}).
	 *
	 * @param clientJar virtual-filesystem path of injected-client.jar
	 * @param apiJar virtual-filesystem path of runelite-api.jar
	 * @param codebase the jav_config codebase URL
	 * @param params applet parameters, {@code key\tvalue} pairs separated by {@code \n}
	 * @param width initial applet width
	 * @param height initial applet height
	 * @return "ok" or "error:..." (also reflected in {@link #phase()})
	 */
	public static String bootInjected(String clientJar, String apiJar, String codebase, String params, int width, int height)
	{
		try
		{
			phase = "loading-jar";
			URLClassLoader loader = classLoader(clientJar, apiJar);
			Class<?> clientClass = loader.loadClass("client");
			phase = "instantiating";
			Object client = clientClass.getDeclaredConstructor().newInstance();
			final URL codeBase = new URL(codebase);
			final Map<String, String> parameters = parse(params);

			Class<?> configurationType = loader.loadClass("net.runelite.api.ClientConfiguration");
			Object configuration = Proxy.newProxyInstance(loader, new Class<?>[]{configurationType},
				new InvocationHandler()
				{
					@Override
					public Object invoke(Object proxy, Method method, Object[] args)
					{
						switch (method.getName())
						{
							case "getCodeBase":
								return codeBase;
							case "getParameter":
								return parameters.get(args[0]);
							case "onError":
								phase = "rs-error:" + args[0];
								return null;
							case "toString":
								return "BrowserBoot.ClientConfiguration";
							case "hashCode":
								return System.identityHashCode(proxy);
							case "equals":
								return proxy == args[0];
							default:
								return null;
						}
					}
				});
			clientClass.getMethod("setConfiguration", configurationType).invoke(client, configuration);
			installNoOpCallbacks(loader, clientClass, client);

			show((Applet) client, width, height);
			phase = "initializing";
			clientClass.getMethod("initialize").invoke(client);
			phase = "started";
			return "ok";
		}
		catch (Throwable t)
		{
			phase = "error:" + describe(t);
			return phase;
		}
	}

	/**
	 * Installs a no-op {@code net.runelite.api.hooks.Callbacks} into the injected
	 * client so it does not NPE on its first render. RuneLite normally populates
	 * this field via Guice member injection; here we build a stub proxy (mouse/key
	 * hooks pass their event through, {@code draw} returns true, everything else is
	 * a no-op) and set the client's Callbacks field reflectively, located by type
	 * so the obfuscated field name does not matter. Best effort: a failure is
	 * logged as a phase note but does not abort the boot.
	 */
	private static void installNoOpCallbacks(URLClassLoader loader, Class<?> clientClass, Object client)
	{
		try
		{
			Class<?> callbacksType = loader.loadClass("net.runelite.api.hooks.Callbacks");
			Object callbacks = Proxy.newProxyInstance(loader, new Class<?>[]{callbacksType},
				new InvocationHandler()
				{
					@Override
					public Object invoke(Object proxy, Method method, Object[] args)
					{
						Class<?> returnType = method.getReturnType();
						if (MouseEvent.class.isAssignableFrom(returnType))
						{
							return args != null && args.length > 0 ? args[0] : null;
						}
						if (returnType == boolean.class)
						{
							// draw(Renderable, boolean) -> true (render everything);
							// isRuneLiteClientOutdated() -> false.
							return !"isRuneLiteClientOutdated".equals(method.getName());
						}
						switch (method.getName())
						{
							case "toString":
								return "BrowserBoot.NoOpCallbacks";
							case "hashCode":
								return System.identityHashCode(proxy);
							case "equals":
								return proxy == args[0];
							default:
								return null;
						}
					}
				});

			for (Field field : clientClass.getDeclaredFields())
			{
				if (!Modifier.isStatic(field.getModifiers()) && field.getType() == callbacksType)
				{
					field.setAccessible(true);
					field.set(client, callbacks);
					return;
				}
			}
			phase = "callbacks-warn:no Callbacks field found";
		}
		catch (Throwable t)
		{
			phase = "callbacks-warn:" + describe(t);
		}
	}

	private static URLClassLoader classLoader(String... jarPaths) throws Exception
	{
		URL[] urls = new URL[jarPaths.length];
		for (int i = 0; i < jarPaths.length; i++)
		{
			urls[i] = new File(jarPaths[i]).toURI().toURL();
		}
		return new URLClassLoader(urls, BrowserBoot.class.getClassLoader());
	}

	private static void show(Applet client, int width, int height)
	{
		applet = client;
		client.setSize(width, height);
		Frame frame = new Frame("Old School RuneScape");
		frame.setLayout(new BorderLayout());
		frame.add(client, BorderLayout.CENTER);
		frame.setSize(width, height);
		frame.setVisible(true);
	}

	/** Parses {@code key\tvalue} pairs separated by {@code \n} (values may contain '='). */
	private static Map<String, String> parse(String params)
	{
		Map<String, String> map = new HashMap<>();
		if (params == null || params.isEmpty())
		{
			return map;
		}
		for (String line : params.split("\n"))
		{
			int tab = line.indexOf('\t');
			if (tab > 0)
			{
				map.put(line.substring(0, tab), line.substring(tab + 1));
			}
		}
		return map;
	}

	private static String describe(Throwable t)
	{
		Throwable cause = t instanceof InvocationTargetException && t.getCause() != null ? t.getCause() : t;
		StringBuilder sb = new StringBuilder();
		sb.append(cause.getClass().getName());
		if (cause.getMessage() != null)
		{
			sb.append(": ").append(cause.getMessage());
		}
		StackTraceElement[] stack = cause.getStackTrace();
		if (stack.length > 0)
		{
			sb.append(" @ ").append(stack[0]);
		}
		return sb.toString();
	}
}
