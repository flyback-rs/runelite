// Routes CheerpJ's TCP sockets through the project's WSS<->TCP gateway instead
// of Tailscale — the real fix, since CheerpJ intercepts networking at its own
// layer and ignores java.net's SocketImplFactory.
//
// CheerpJ's cheerpOS.js resolves the global (`self`) names cjTailscaleSocket
// (the TCP socket class), cjTailscaleResolve (DNS), cjTailscaleParseIp and the
// cjEnableTailscale flag at call time, but by default only defines them after a
// real Tailscale init. We define our own and flip the flag, so:
//   - cheerpOSResolveHost(host) -> our cjTailscaleResolve assigns the host a
//     sentinel IP (240.0.0.N) and remembers it (no browser DNS needed);
//   - the TCP path does `new cjTailscaleSocket()` -> our GatewaySocket, whose
//     connect(ip,port) maps the sentinel back to the hostname and opens a
//     WebSocket to the gateway (which does real DNS + relays to <host>:port).
//
// EXPERIMENTAL: depends on CheerpJ 4.3 internals. Verbose logging is intentional
// so the byte-buffer / ip-address shapes can be confirmed on first run.

(function () {
	const EAGAIN = -11;
	let gatewayBase = "ws://localhost:8090";
	const hostByOctet = new Map(); // sentinel last-octet -> hostname
	let lastResolvedHost = null;
	let nextOctet = 1;
	let loggedBufType = false;

	function installCheerpjNet(gateway) {
		gatewayBase = String(gateway).replace(/\/+$/, "");
		self.cjEnableTailscale = true;
		self.cjTailscaleParseIp = (ipAddr) => ipAddr; // identity; GatewaySocket decodes it
		self.cjTailscaleResolve = (hostName) => {
			let octet = null;
			for (const [k, v] of hostByOctet) {
				if (v === hostName) octet = k;
			}
			if (octet === null) {
				octet = nextOctet++ & 0xff;
				hostByOctet.set(octet, hostName);
			}
			lastResolvedHost = hostName;
			console.log(`[cjnet] resolve ${hostName} -> 240.0.0.${octet}`);
			// cheerpOSResolveHost swaps bytes: firstOctet = ret&0xff, lastOctet = (ret>>24)&0xff.
			// Encode so the Java-visible address is 240.0.0.<octet>.
			return Promise.resolve((((octet & 0xff) << 24) | 240) >>> 0);
		};
		self.cjTailscaleSocket = GatewaySocket;
		self.cjTailscaleUdpSocket = GatewaySocket; // OSRS is TCP-only; stub for safety
		console.log(`[cjnet] installed; TCP relays to ${gatewayBase}`);
	}

	function hostFromIp(ipAddr) {
		let octet = -1;
		if (typeof ipAddr === "number") {
			const lo = ipAddr & 0xff;
			const hi = (ipAddr >>> 24) & 0xff;
			octet = hostByOctet.has(lo) ? lo : hi;
		} else if (typeof ipAddr === "string") {
			const parts = ipAddr.split(".");
			octet = Number(parts[parts.length - 1]);
		} else if (ipAddr && ipAddr.length) {
			octet = ipAddr[ipAddr.length - 1] & 0xff;
		}
		// Fall back to the most recently resolved host (the client connects to one
		// JS5/game host at a time), so an imperfect IP round-trip still works.
		return hostByOctet.get(octet) ?? lastResolvedHost;
	}

	class GatewaySocket {
		static get Eagain() {
			return EAGAIN;
		}

		constructor() {
			this.ws = null;
			this.incoming = [];
			this.buffered = 0;
			this.outQueue = [];
			this.open = false;
			this.closed = false;
			this.readWaiters = [];
			this.writeWaiters = [];
		}

		bind() {
			return 0;
		}

		connect(ipAddr, port) {
			const host = hostFromIp(ipAddr);
			console.log(`[cjnet] connect ip=${JSON.stringify(ipAddr)} port=${port} -> ${host}`);
			if (!host) {
				this.closed = true;
				return -1;
			}
			const url = `${gatewayBase}/connect?host=${encodeURIComponent(host)}&port=${port}`;
			const ws = new WebSocket(url);
			ws.binaryType = "arraybuffer";
			this.ws = ws;
			ws.onopen = () => {
				this.open = true;
				for (const c of this.outQueue) ws.send(c);
				this.outQueue = [];
				console.log(`[cjnet] open ${host}:${port}`);
				this.#wake();
			};
			ws.onmessage = (event) => {
				const chunk = new Uint8Array(event.data);
				if (chunk.length) {
					this.incoming.push(chunk);
					this.buffered += chunk.length;
				}
				this.#wake();
			};
			ws.onclose = () => {
				this.closed = true;
				this.#wake();
			};
			ws.onerror = () => {
				this.closed = true;
				console.warn(`[cjnet] error ${host}:${port} — is the gateway running at ${gatewayBase}?`);
				this.#wake();
			};
			return 0; // non-blocking connect in progress; readiness via waitOutgoing()
		}

		recv(buf, off, len) {
			if (!loggedBufType) {
				loggedBufType = true;
				console.log(`[cjnet] recv buffer type: ${buf && buf.constructor && buf.constructor.name}`);
			}
			if (this.buffered === 0) {
				return this.closed ? 0 : EAGAIN; // 0 = EOF
			}
			let copied = 0;
			while (copied < len && this.incoming.length) {
				const head = this.incoming[0];
				const take = Math.min(head.length, len - copied);
				buf.set(head.subarray(0, take), off + copied);
				copied += take;
				this.buffered -= take;
				if (take === head.length) this.incoming.shift();
				else this.incoming[0] = head.subarray(take);
			}
			return copied;
		}

		send(buf, off, len) {
			if (this.closed) {
				return -1;
			}
			const chunk = buf.slice(off, off + len);
			if (this.open) this.ws.send(chunk);
			else this.outQueue.push(chunk);
			return len;
		}

		readAvailable() {
			return this.buffered;
		}

		waitIncoming() {
			if (this.buffered > 0 || this.closed) return Promise.resolve(true);
			return new Promise((resolve) => this.readWaiters.push(resolve));
		}

		waitOutgoing() {
			if (this.open || this.closed) return Promise.resolve(true);
			return new Promise((resolve) => this.writeWaiters.push(resolve));
		}

		#wake() {
			for (const r of this.readWaiters.splice(0)) r(true);
			for (const r of this.writeWaiters.splice(0)) r(true);
		}

		close() {
			this.closed = true;
			try {
				if (this.ws) this.ws.close();
			} catch {
				// already closing
			}
		}

		delete() {}
		shutdownRx() {
			return 0;
		}
		shutdownTx() {
			return 0;
		}
		getName() {
			return 0;
		}
		listen() {
			return -1;
		}
		accept() {
			return -1;
		}
		injectConnection() {
			return -1;
		}
	}

	self.__installCheerpjNet = installCheerpjNet;
})();
