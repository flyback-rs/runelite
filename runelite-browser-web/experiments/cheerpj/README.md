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

# 3) Serve (Range requests, no COOP/COEP — CheerpJ isolates itself) and open it
node serve.mjs                     # http://localhost:8095
```

Without a gateway running, CheerpJ initialises (Java 8 for the vanilla applet,
Java 11 for the injected client), the boot shim
instantiates the `client` applet with the `jav_config` parameters and calls
`init()`/`start()`, and the client draws its loading screen — then reports a JS5
connection error, because it can't reach `<world>:43594`. That already proves
the whole class-loading and AWT render path.

### Use `mode=injected` to reach the login screen

The **vanilla** gamepack (`mode=vanilla`, the default) now shows *"The Legacy
Java Client is no longer supported — use the Jagex Launcher or Steam"*: Jagex
gates the raw applet behind their launcher. **RuneLite's injected client has that
gate removed**, so it boots to the actual login screen. Use it:

```sh
node fetch-assets.mjs --injected        # injected-client + runelite-api + runtime libs
node serve.mjs
# open http://localhost:8095/?mode=injected
```

`--injected` also downloads RuneLite's runtime libraries the injected client
needs (SLF4J, Guava, org.json — pinned to RuneLite's versions; BouncyCastle is
already bundled) from Maven Central, and writes the resulting classpath into
`lib/config.json`. It runs under CheerpJ's **Java 11** runtime (the injected
client is Java 11 bytecode); the vanilla applet uses Java 8.

The boot shim also installs a no-op RuneLite `Callbacks` into the injected client
(which RuneLite normally supplies via dependency injection) so it renders without
NPE-ing. Getting past the login screen still needs the gateway (below) for the
game socket, and a Jagex account.

## Networking (getting past the loading screen)

The default and recommended transport is the project's **own gateway**, not
Tailscale. We install a custom `java.net.Socket` implementation
([`WsSocketImpl`](../../../runelite-browser-cheerpj/src/main/java/net/runelite/browser/cheerpj/WsSocketImpl.java))
whose bytes cross into JavaScript through CheerpJ `natives`
([`socket-natives.js`](socket-natives.js)) and out over a WebSocket to
[`runelite-browser-gateway`](../../../runelite-browser-gateway/), which relays
them to `<world>:43594`. No Tailscale, no VPN.

Run the gateway (either target), then open the page:

```sh
# Local Node gateway (from runelite-browser-gateway/)
node src/serve.js            # or: npm run build && npm start  → ws://localhost:8090

# ...or deploy the Cloudflare Worker and use its URL
npm run deploy:worker        # → wss://<your-worker>.workers.dev
```

- `http://localhost:8095/` — uses `ws://<page-host>:8090` by default.
- `http://localhost:8095/?gateway=wss://<your-worker>.workers.dev` — any gateway.

With the socket up, the client downloads the cache over JS5 (persisted in
IndexedDB via the CheerpJ virtual filesystem, so later boots start warm) and
reaches the title screen. Logging in requires a Jagex account exactly as on
desktop.

### Tailscale (fallback)

CheerpJ's built-in transport is still available with `?gateway=none`, which
re-enables the Tailscale options:

- `?gateway=none&tsKey=<tailscale-auth-key>`
  ([create a key](https://login.tailscale.com/admin/settings/keys)), or
- `?gateway=none&ts=interactive` — opens the Tailscale login UI.

The tailnet needs an exit node / subnet router that can reach the internet; the
page logs the assigned Tailscale IP when the tunnel is up.

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
