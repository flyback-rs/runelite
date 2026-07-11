# runelite-browser-gateway

A blind byte relay that lets the browser client reach the Old School RuneScape
servers. Browsers cannot open raw TCP sockets, so the WasmGC transport
([`WebSocketDuplexStream`](../runelite-browser-core/src/main/java/net/runelite/browser/platform/browser/WebSocketDuplexStream.java))
connects to this gateway over a binary WebSocket, and the gateway forwards the
stream verbatim to `<world>:43594`.

## Design

- **Blind relay.** Payloads are piped both ways byte-for-byte. Nothing is parsed,
  inspected, or logged — the game protocol stays opaque to the gateway.
- **Destination allowlist.** A connection is only opened if `host:port` matches a
  rule, so the gateway cannot be turned into an open proxy. The default rule is
  `oldschool<N>.runescape.com:43594` (game + JS5). See [`allowlist.ts`](src/allowlist.ts).
- **Per-IP connection cap.** At most 8 concurrent relays per client IP (`1013` on
  excess) to bound resource use.
- **Health probe.** `GET /health` returns `200 ok` for load balancers / readiness.

## Protocol

Open a WebSocket to:

```
ws(s)://<gateway>/connect?host=<world-host>&port=<port>
```

- The connection is accepted only if `host:port` passes the allowlist; otherwise
  it is closed with code `1008` (policy violation).
- Every binary frame the client sends is written to the TCP socket; every TCP
  chunk received is sent back as a binary frame. Text frames are ignored.
- Close codes surfaced to the client: `1000` upstream closed cleanly, `1008`
  destination not allowed, `1011` upstream error, `1013` too many connections.

## Running

```sh
npm ci
npm run build          # esbuild → dist/serve.js
npm start              # or: node dist/serve.js
```

Configuration is via environment variables:

| Variable        | Default     | Meaning                                                      |
| --------------- | ----------- | ------------------------------------------------------------ |
| `PORT`          | `8090`      | Listen port.                                                 |
| `HOST`          | `0.0.0.0`   | Listen address.                                              |
| `GATEWAY_ALLOW` | OSRS worlds | Comma-separated `host-glob:port` rules (`*` wildcards; port `*` = any). |

Example allowlist spec:

```
GATEWAY_ALLOW="*.runescape.com:43594,oldschool*.runescape.com:443"
```

The browser shell points the transport at the gateway by setting
`self.runeliteGatewayUrl` (a `ws(s)://…` base) before connecting.

## Development

```sh
npm run typecheck      # tsc --noEmit
npm run lint           # oxlint
npm run format:check   # oxfmt --check
npm test               # vitest: allowlist + relay round-trip
```

`test/live-js5.test.ts` is network-gated (`LIVE_JS5=1`): it relays a real JS5
connect handshake to a live world and expects a status byte back (read-only, no
login), proving the relay against Jagex infrastructure. It is skipped by default
because it requires outbound access to `:43594`.

## Deployment note

The gateway needs outbound TCP to the game port (`43594`), which many sandboxes
and CI runners block. Deploy it where that egress is permitted (e.g. a small VPS
or container) and serve the client from a cross-origin-isolated origin (COOP +
COEP) so `SharedArrayBuffer` is available.
