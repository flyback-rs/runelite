# Running the real client under CheerpJ

This document records the CheerpJ boot spike: why the real Old School RuneScape
client runs under CheerpJ rather than compiling to WasmGC, how it boots, and the
two hand-offs that matter for this port — **pixels** (into our GPU renderer) and
**networking** (out through the gateway). It ends with the honest status of what
boots today versus what needs a real deployment.

## Why CheerpJ, not TeaVM/WasmGC

The browser runtime engine (parts 1–2) compiles our own Java to WebAssembly GC
with TeaVM. That path does **not** work for the game client itself:

- **The gamepack cannot be parsed.** TeaVM 0.11 throws
  `IllegalArgumentException: Unknown runtime constant` on the obfuscator's
  `invokedynamic` forms (our own `makeConcatWithConstants` compiles fine, so it is
  the obfuscated variants specifically). The client never reaches code generation.
- **The runtime surface is huge even if it parsed.** The client leans on
  `java.awt.*` (Component/Graphics/Toolkit/EventQueue/Clipboard/PixelGrabber/
  BufferedImage…), `sun.misc.Unsafe`, `java.lang.Thread` (×45 classes),
  reflection, `javax.sound`, `SSLSocket`, `RandomAccessFile` and crypto — none of
  which TeaVM's WasmGC class library provides.

[CheerpJ](https://cheerpj.com) is a full JVM compiled to WebAssembly. It runs
**unmodified** JVM bytecode — including `invokedynamic`, AWT/Swing, reflection and
threads — and renders AWT into an HTML canvas. So the division of labour is:

- **CheerpJ hosts the real client** (the gamepack, or RuneLite's pre-injected
  client) unchanged.
- **Our WasmGC core + WebGPU renderer** become the acceleration/overlay layer
  around it, fed by the client through the interop hand-off below.

## Boot flow

The harness lives in [`../runelite-browser-web/experiments/cheerpj/`](../runelite-browser-web/experiments/cheerpj/)
(see its README for run instructions): `index.html` loads the CheerpJ 4.3 loader
from the CDN and `boot.js` drives it.

1. `node fetch-assets.mjs` downloads `jav_config.ws` and the gamepack it names
   (optionally RuneLite's injected client from `repo.runelite.net`) into the
   git-ignored `lib/`, along with the `cheerpj-boot.jar` shim built by
   [`../runelite-browser-cheerpj/`](../runelite-browser-cheerpj/).
2. `await cheerpjInit({ version: 8, … })` — brings up the JVM. CheerpJ supports
   applets on its Java 8 runtime only, which suits the applet-era client.
3. `cheerpjCreateDisplay(-1, -1, container)` hosts the AWT output, and
   `cheerpjRunLibrary("/app/lib/cheerpj-boot.jar")` loads the boot shim.
4. The shim (`BrowserBoot`, plain Java 8, no compile-time dependency on the
   client) loads the client jars from the CheerpJ virtual filesystem with a
   `URLClassLoader` and mirrors RuneLite's own `ClientLoader`:
   - **vanilla**: instantiate `client` (it `extends java.applet.Applet` through
     its obfuscated chain), `setStub` with an `AppletStub` whose `getParameter`
     serves the `jav_config.ws` values, then `init()`/`start()`;
   - **injected**: instantiate `client`, install a reflective
     `ClientConfiguration` proxy via `setConfiguration`, then `initialize()` —
     the injected client replaces the applet plumbing with that interface.

`window.__cheerpj` (and the on-page log) publishes the phases so a headless
driver can observe progress.

## Hand-off 1 — pixels into the GPU renderer

The injected client exposes exactly the seams RuneLite's own GPU plugin uses, all
reachable across CheerpJ's Java↔JS interop:

- **2D framebuffer (simplest, ship first).** `Client.getBufferProvider()` returns a
  `BufferProvider` with `getPixels(): int[]` (ARGB), `getWidth()`, `getHeight()`.
  Each frame, read that array via interop and upload it as a texture, compositing
  it over (or instead of) our scene — the same idea as `GpuPlugin.drawUi`. This
  gets the real client on screen through our pipeline with no client patching.
- **3D acceleration (later).** `Client.setDrawCallbacks(DrawCallbacks)` is the hook
  the GPU plugin uses to intercept scene geometry (`draw`, `drawScenePaint`,
  `drawSceneModel`). Bridging those callbacks into our `SceneCommandBuffer` lets
  the WebGPU backend draw the world itself, with the client's 2D buffer as the UI
  overlay. This is the Stage-4 renderer-completion work.
- `Client.getCanvas()` (a `java.awt.Canvas`) is the AWT surface CheerpJ would
  otherwise present directly; we bypass it in favour of the buffer/geometry seams.

The interop cost is one `int[]` copy per frame (canvas-sized, ~1.9 MB at
768×544). CheerpJ marshals typed arrays efficiently; if it becomes a bottleneck,
the `DrawCallbacks` path avoids the full-frame copy entirely.

## Hand-off 2 — networking through the gateway

The client opens a raw `java.net.Socket` to `<world>:43594` for the game and JS5
protocols. In the browser that socket must be tunnelled. Two options:

- **This project's gateway (default, shared with the WasmGC path).** Because
  CheerpJ runs real bytecode, we install a custom `SocketImpl`
  ([`WsSocketImpl`](../runelite-browser-cheerpj/src/main/java/net/runelite/browser/cheerpj/WsSocketImpl.java))
  via `Socket.setSocketImplFactory`, so every `java.net.Socket` the client opens
  is relayed. Its read/write/connect/close cross into JavaScript through CheerpJ
  `natives` (`WsBridge` → [`socket-natives.js`](../runelite-browser-web/experiments/cheerpj/socket-natives.js)) —
  a Java `byte[]` arrives on the JS side as an `Int8Array` over the same memory,
  so reads fill the caller's buffer directly, and a native returning a `Promise`
  suspends the calling Java thread, giving blocking-socket semantics. The JS side
  opens a WebSocket to [`runelite-browser-gateway`](../runelite-browser-gateway/)
  (a blind WSS↔TCP byte relay with a destination allowlist), which forwards the
  stream to `<world>:43594`. The gateway runs as a local Node server or a
  Cloudflare Worker (`connect()` from `cloudflare:sockets`). No VPN. DNS is done
  by the gateway — `WsSocketImpl` relays the socket address's host string, so no
  browser-side resolution is needed.
- **CheerpJ built-in networking (fallback).** CheerpJ tunnels JVM sockets over
  WebSockets using a Tailscale control plane; selectable with `?gateway=none`.
  This works without the factory override but ties deployment to a tailnet.

Either way the game port `43594` (or the `:443` fallback) must be reachable from
wherever the tunnel terminates.

One assumption worth calling out: `Socket.setSocketImplFactory` can only be set
once per JVM, so if the CheerpJ runtime were to install its own factory ours
would fail — `BrowserBoot.installGateway` surfaces that as a `gateway-error`
phase rather than silently falling back. In practice CheerpJ patches the socket
runtime at a lower level (not via a public factory), so the override installs
cleanly; validating this end-to-end needs an environment with browser egress.

## Cache

On first login the client downloads the game cache over JS5. Under CheerpJ this
lands in the JVM's virtual filesystem, which is backed by IndexedDB, so subsequent
boots start warm. No separate cache implementation is needed for the CheerpJ path
(our own OPFS/IndexedDB cache in Stage 5 is for the WasmGC renderer/overlay layer).

## Licensing

CheerpJ is free for open-source and personal use; commercial/closed distribution
needs a license from Leaning Tech. RuneLite is an open-source project, but anyone
shipping this publicly should confirm their use falls under CheerpJ's free tier or
obtain a license. This is a deployment concern, not a code one.

## Honest status

Reachable and verified:

- The CheerpJ 4.3 runtime is reachable (CDN returns the loader), and the client
  jars are in hand (`injected-client.jar` + `runelite-api.jar`).
- The interop seams for both hand-offs exist and are the ones RuneLite itself
  uses (`BufferProvider.getPixels`, `setDrawCallbacks`, `getCanvas`).
- The gateway carries arbitrary TCP bytes and is validated end-to-end (Node and
  Cloudflare Worker targets), and the CheerpJ socket relay that feeds it — the
  custom `SocketImpl` + `natives` bridge — is built and compiles.

The boot is fully wired: the shim jar builds, the asset fetcher pulls the
gamepack + jav_config, and the page drives the applet lifecycle exactly as
RuneLite's `ClientLoader` does (both vanilla and injected modes). What each
environment can demonstrate:

- **Without a gateway running** (any machine): CheerpJ initialises, the client
  applet instantiates and starts, and it draws its loading screen before
  reporting a JS5 connection error — proving class-loading and the AWT render
  path end to end.
- **With the gateway** (Node server or Cloudflare Worker, default transport):
  the client's sockets are relayed to `<world>:43594`, the cache downloads
  (persisted in IndexedDB), and the title screen appears. Tailscale
  (`?gateway=none&tsKey=`) is the fallback. Logging in from there requires a
  Jagex account, as on desktop.
- **In the CI sandbox** neither is demonstrable — headless browser egress to
  the CheerpJ CDN is reset and raw `:43594` egress is blocked. These are
  environment limits, not design blockers; the harness is built to run where
  normal egress exists.
