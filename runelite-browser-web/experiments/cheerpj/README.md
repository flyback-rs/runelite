# CheerpJ boot spike

An R&D harness that boots the **real** Old School RuneScape client in the browser
under [CheerpJ](https://cheerpj.com) (a full JVM in WebAssembly). This is the path
chosen for the client itself because the obfuscated gamepack cannot be compiled to
WasmGC by TeaVM — see [`../../../docs/cheerpj-integration.md`](../../../docs/cheerpj-integration.md)
for the full analysis.

This directory is a spike, not shipped code: it is excluded from the package's
build, lint, format and typecheck.

## Running

1. Provide the client classpath jars in `lib/` (git-ignored, not redistributed):
   - `lib/injected-client.jar` — RuneLite's pre-injected client (from
     `repo.runelite.net`), or
   - the vanilla `gamepack_<rev>.jar` (fetched by CheerpJ from the codebase in a
     real deployment; see `?codebase=`/`?jar=` below).
   - `lib/runelite-api.jar` if using the injected client.

2. Serve with cross-origin isolation and open the page:

   ```sh
   node serve.mjs           # http://localhost:8095 (COOP/COEP)
   ```

3. Networking: the client's game socket must be tunnelled. Either use CheerpJ's
   built-in networking, or route it through the project's `runelite-browser-gateway`
   (see the integration doc). The game port `43594` must be reachable from wherever
   the tunnel terminates.

### Query parameters

| Param      | Default                          | Meaning                                  |
| ---------- | -------------------------------- | ---------------------------------------- |
| `codebase` | `https://oldschool.runescape.com/` | Base URL the applet loads the gamepack from. |
| `jar`      | `gamepack.jar`                   | Gamepack jar name.                       |
| `world`    | `1`                              | World id parameter.                      |

## What this proves (and doesn't)

`window.__cheerpj` reports the boot phases: `runtimeReady` (CheerpJ JVM up),
`clientClass` (the `client` class resolved from the classpath), `instantiated`
(applet constructed). Reaching a drawn login screen additionally needs a working
game socket and cache download, i.e. real network egress to Jagex — not available
in the CI sandbox. The success criterion for the spike is *runtime + client
instantiation*, with the pixel and networking hand-offs documented for a real
deployment.
