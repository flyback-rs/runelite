# runelite-browser-web

Part 2 of the RuneLite browser port: the **browser runtime engine**. A GPU renderer
runs in an OffscreenCanvas render worker, fed per-frame `SceneCommandBuffer`s over a
`SharedArrayBuffer` ring by a WasmGC game worker, with a DOM shell on the main thread —
the full three-thread architecture from the design.

Because the real injected game client is unavailable, the engine is driven by a
deterministic **synthetic scene-replay source** written in Java/WasmGC in
`runelite-browser-core` (`SceneReplaySource` + the `GameWorker` `@JSExport` API),
emitting the *real* vertex/uniform format the injected client will use: a textured
floor and spinning cube (texture-array materials via the vertex `tex` field),
translucent panels (sorted back-to-front by the producer, blended by the renderer),
screen-space glyph runs, and a HUD overlay quad.

The renderer also composites a **UI pixel layer** over the scene (posted to the render
worker as a transferable RGBA buffer — the seam the CheerpJ-hosted client's
`BufferProvider.getPixels()` frames will arrive through) and renders **text** from a
glyph atlas baked at startup from the three RuneScape TTFs bundled with the client.

## Architecture

```
main thread (main.ts)                 game worker (game.worker.ts)
  DOM shell + HUD + panels              loads runelite-browser.wasm
  input capture ─────────────┐         produces SceneCommandBuffer frames
  transfers OffscreenCanvas   │         writes into the SAB ring (Atomics)
        │                     │                    │
        ▼                     ▼                    ▼
  render worker (render.worker.ts) ◀── SharedArrayBuffer ring (transport/ring.ts)
    WebGPU (backends/webgpu.ts) primary, WebGL2 (backends/webgl2.ts) fallback
    parses the frame (scene/command-buffer.ts), uploads dirty ranges, batches, draws
```

Shaders (`src/shaders/`) are ported from the RuneLite GPU plugin's `vert.glsl`/`frag.glsl`
(packed-`abhsl` unpack, OSRS HSL→RGB, reversed-Z projection) to both GLSL ES 3.00 (WebGL2)
and WGSL (WebGPU).

## Toolchain

TypeScript 7 (`tsc --noEmit` for types), esbuild (bundling), oxlint + oxfmt
(lint/format), vitest (unit), Playwright (E2E). Node 22+.

## Develop

```
# 1) build the WasmGC module (from the repo root)
./gradlew -p runelite-browser-core buildWasmGC

# 2) in this directory
npm install
npm run build       # esbuild -> dist/, copies the wasm + runtime
npm run serve       # serves dist/ on :8080 with COOP/COEP (required for SharedArrayBuffer)
# open http://localhost:8080/?backend=webgl2  (or ?backend=webgpu, or omit for auto)
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm run format`, `npm run test`
(vitest), `npm run e2e` (Playwright).

## Verify

```
npm run lint && npm run format:check && npm run typecheck && npm run build && npm run test
npx playwright test --project=webgl2   # headless render smoke: boots, renders, animates
npx playwright test --project=webgpu   # only where a GPU/WebGPU adapter is available
```

The E2E asserts the module boots in the workers, `crossOriginIsolated` is true, the render
loop advances without stalling the main thread, and (WebGL2) the scene is drawn and
animates via pixel readback.
