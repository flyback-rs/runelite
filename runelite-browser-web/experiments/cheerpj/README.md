# Running the real client under CheerpJ

This directory boots the **real** Old School RuneScape client in a browser under
[CheerpJ](https://cheerpj.com) (a full JVM in WebAssembly). Why this path was
chosen — and how it hands off pixels and networking to the rest of the port — is
covered in [`docs/cheerpj-integration.md`](../../../docs/cheerpj-integration.md).

This is R&D scaffolding, not shipped code: it is excluded from the package's
build/lint/format gates, and the client jars are git-ignored (never redistributed).

## Run it

```sh
# 1) Build the boot shim (from the repo root; any JDK 11+, compiled for Java 8)
gradle -p runelite-browser-cheerpj jar

# 2) Fetch the gamepack + jav_config into lib/ (from this directory)
node fetch-assets.mjs              # add --injected for RuneLite's injected client
                                   # add --world 39 to pin a specific world

# 3) Serve with COOP/COEP and open it
node serve.mjs                     # http://localhost:8095
```

What you should see without any networking setup: CheerpJ initialises (Java 8
runtime), the boot shim instantiates the `client` applet with the `jav_config`
parameters and calls `init()`/`start()`, and the client draws its loading
screen — then reports a JS5 connection error, because browsers cannot open the
raw TCP socket to `<world>:43594`. That already proves the whole class-loading
and AWT render path.

## Networking (getting past the loading screen)

CheerpJ tunnels JVM `Socket`s over **Tailscale**. To let the client reach
`oldschool<N>.runescape.com:43594` you need a tailnet whose exit node (or subnet
router) can reach the internet, then:

- `http://localhost:8095/?tsKey=<tailscale-auth-key>` — pre-authenticated key
  ([create one](https://login.tailscale.com/admin/settings/keys)), or
- `http://localhost:8095/?ts=interactive` — opens the Tailscale login UI.

The page logs the assigned Tailscale IP when the tunnel is up. With networking
up, the client downloads the cache over JS5 (persisted in IndexedDB via the
CheerpJ virtual filesystem, so later boots start warm) and reaches the title
screen. Logging in requires a Jagex account exactly as on desktop.

The project's own WSS↔TCP relay (`runelite-browser-gateway`) is the networking
path for the WasmGC engine; pointing CheerpJ's socket layer at it instead of
Tailscale is future work (CheerpJ does not currently expose a socket-transport
hook).

## Query parameters

| Param    | Default   | Meaning                                            |
| -------- | --------- | -------------------------------------------------- |
| `mode`   | `vanilla` | `vanilla` (gamepack applet) or `injected` (RuneLite's injected client; fetch with `--injected`). |
| `world`  | config    | Retarget `oldschool<N>.runescape.com`.              |
| `tsKey`  | —         | Tailscale auth key (enables socket networking).     |
| `ts`     | —         | `interactive` for browser-based Tailscale login.    |
| `width`/`height` | jav_config | Applet size (defaults 765×503).            |

## How it boots

`boot.js` → `cheerpjInit({version: 8, …})` → `cheerpjCreateDisplay` →
`cheerpjRunLibrary("/app/lib/cheerpj-boot.jar")` →
`BrowserBoot.bootVanilla|bootInjected(...)` (see
[`runelite-browser-cheerpj`](../../../runelite-browser-cheerpj/)), which loads
the client jars from the CheerpJ virtual filesystem with a `URLClassLoader` and
drives the same boot RuneLite's own `ClientLoader` performs: the vanilla applet
gets an `AppletStub` whose `getParameter` serves the `jav_config` values; the
injected client gets a reflective `ClientConfiguration` proxy plus
`initialize()`. Progress is on `window.__cheerpj` / the on-page log.

## Known limitations

- **Applets require CheerpJ's Java 8 runtime** (their documented constraint);
  the shim is compiled with `--release 8`.
- Cross-origin HTTP calls the client makes (e.g. to Jagex web services) are
  subject to browser CORS; some title-screen niceties may fail even when the
  game socket works.
- CheerpJ displays a non-commercial license notice; distribution beyond
  open-source/personal use needs a Leaning Tech license.
- The injected client expects the RuneLite runtime around it (callbacks,
  event bus); `mode=injected` boots it, but vanilla is the reliable path until
  the WasmGC overlay layer takes on that role.
