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

The spike lives in [`../runelite-browser-web/experiments/cheerpj/`](../runelite-browser-web/experiments/cheerpj/):
`index.html` loads the CheerpJ 4.2 loader from the CDN and `boot.js` drives it.

1. `await cheerpjInit({ version: 8 })` — brings up the JVM. The vanilla client
   targets an applet-era JDK, so the Java 8 runtime is used.
2. `cheerpjRunLibrary(classpath)` — mounts the client jars as a library and
   returns an async handle. Classpath is either RuneLite's injected client
   (`injected-client.jar` + `runelite-api.jar`) or the vanilla
   `gamepack_<rev>.jar` fetched from the codebase.
3. Resolve the entry class `client` (it `extends java.applet.Applet` through its
   obfuscated chain and `implements net.runelite.api.Client`), instantiate it, and
   drive the applet lifecycle (`setStub`/`init`/`start`) with a minimal
   `AppletStub` whose `getParameter` returns the `jav_config.ws` values.

`window.__cheerpj` publishes the phases (`runtimeReady`, `clientClass`,
`instantiated`) so a headless driver can observe progress.

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

- **CheerpJ built-in networking.** CheerpJ tunnels JVM sockets over WebSockets
  (its default uses a Tailscale control plane). This works without touching the
  client but ties deployment to CheerpJ's networking model.
- **This project's gateway (preferred, shared with the WasmGC path).**
  [`runelite-browser-gateway`](../runelite-browser-gateway/) is a blind WSS↔TCP
  byte relay with a destination allowlist. Its wire protocol is raw TCP bytes over
  a binary WebSocket at `/connect?host=&port=` — protocol-agnostic, so it carries
  the game/JS5 stream verbatim exactly as it carries the WasmGC transport's bytes.
  Pointing CheerpJ's socket layer at the gateway (rather than its default
  transport) is the remaining wiring; the relay itself is already validated
  (unit-tested round-trip, and a live JS5 handshake against a real world when
  `:43594` egress is available).

Either way the game port `43594` must be reachable from wherever the tunnel
terminates.

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

- The CheerpJ 4.2 runtime is reachable (CDN returns the loader), and the client
  jars are in hand (`injected-client.jar` + `runelite-api.jar`).
- The interop seams for both hand-offs exist and are the ones RuneLite itself
  uses (`BufferProvider.getPixels`, `setDrawCallbacks`, `getCanvas`).
- The gateway carries arbitrary TCP bytes and is validated end-to-end.

Not demonstrable in the CI sandbox (environment limits, not design blockers):

- **Headless browser egress to the CheerpJ CDN is blocked** here (the tool proxy
  serves `curl`, but Chromium's third-party requests are reset), so `cheerpjInit`
  cannot complete in this sandbox. It runs in any environment with normal browser
  egress; the spike is structured to be run there.
- **Raw egress to `:43594` is blocked** here, so a live login/cache download
  cannot be exercised. The gateway must be deployed where that egress is allowed.

Success criterion for the spike — *runtime up + client class instantiated* — is
gated behind browser CDN egress; reaching a drawn login screen additionally needs
`:43594` egress and a cache download. Both are deployment conditions. The path is
de-risked: the client host (CheerpJ), the two hand-offs, and the networking relay
are all identified and, where the sandbox allows, verified.
