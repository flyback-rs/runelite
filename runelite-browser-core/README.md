# runelite-browser-core

Part 1 of the RuneLite browser port: the **platform-abstraction seam** that the
rest of the port hangs off, plus a working **TeaVM → WebAssembly GC** build target.

The desktop client assumes Swing/AWT, JNA + LWJGL natives, Guice, reflection,
dynamic proxies, class loading, and a reflectively instantiated injected game
client — none of which compile to WasmGC. This module introduces a small, generic
seam that isolates those desktop/browser differences behind interfaces, so upstream
game/overlay logic can stay platform-neutral.

## Layout

```
net.runelite.browser.platform            the seam (pure Java, compiles to WasmGC)
  PlatformNetwork / PlatformStorage / PlatformRenderer / PlatformUi
  PlatformServices, Platform             DI-free service holder (Guice is a TeaVM blocker)
  AsyncResult / CompletableResult        promise type (CompletableFuture is absent from TeaVM's classlib)
  GameEndpoint, Transport, DuplexStream  networking value types
  SceneCommandBuffer                     packed, reusable per-frame render command buffer
  PanelModel, PanelComponent, ComponentType   declarative replacement for Swing PluginPanel

net.runelite.browser.platform.browser    browser implementations (TeaVM JSO)
  BrowserPlatformStorage                 localStorage-backed, Base64 blobs
  BrowserPlatformUi                      publishes PanelModel JSON to the DOM
  BrowserPlatformNetwork / Renderer      documented stubs (gateway + WebGPU are later parts)
  BrowserPlatformServices

net.runelite.browser.BrowserBootstrap    WasmGC main(): installs services, exercises the seam
src/main/webapp/index.html               loads the wasm + runtime, renders published panels
```

The desktop JVM implementations live next to the code they adapt, in
`runelite-client` under `net.runelite.client.browser`.

## Build

JVM library + unit tests (no browser toolchain needed):

```
gradle -p runelite-browser-core build
```

Compile to WebAssembly GC (emits `build/teavm/wasm-gc/`):

```
gradle -p runelite-browser-core buildWasmGC
# -> runelite-browser.wasm, runelite-browser.wasm-runtime.js, .wasm.map
```

## Running in a browser

The module deliberately uses only `localStorage` and the DOM for this part, so it
does **not** yet require cross-origin isolation. Later parts add
`SharedArrayBuffer` worker queues, which require the server to send:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

To try the bootstrap, copy `src/main/webapp/index.html` next to the generated
`build/teavm/wasm-gc/` output and serve them from one directory, e.g.:

```
cp src/main/webapp/index.html build/teavm/wasm-gc/
cd build/teavm/wasm-gc && python3 -m http.server 8000
```

Opening the page boots the WasmGC module, which round-trips a value through
`localStorage`, submits a scene command buffer, and publishes a demo panel that
renders as DOM — visible proof the Wasm↔JS↔DOM boundary works.
