// CheerpJ native methods backing net.runelite.browser.cheerpj.WsBridge: they
// carry the client's java.net.Socket traffic over a WebSocket to the project's
// gateway (runelite-browser-gateway, local Node or a Cloudflare Worker), instead
// of CheerpJ's built-in Tailscale transport.
//
// CheerpJ matches these by the `Java_<fqcn>_<method>` name and passes a Java
// byte[] as an Int8Array over the same memory ("by reference"), so reads fill the
// caller's buffer directly. A native may return a Promise; CheerpJ suspends the
// calling Java thread until it resolves — giving blocking-socket semantics.

const wsHandles = new Map();
let nextWsHandle = 1;

function wsState() {
	return { ws: null, chunks: [], buffered: 0, closed: false, wake: null };
}

function wsWake(st) {
	if (st.wake) {
		const w = st.wake;
		st.wake = null;
		w();
	}
}

// eslint-disable-next-line no-unused-vars -- `lib` is CheerpJ's required first arg
async function Java_net_runelite_browser_cheerpj_WsBridge_nOpen(lib, gatewayUrl, host, port) {
	const base = String(gatewayUrl).replace(/\/+$/, "");
	const url = `${base}/connect?host=${encodeURIComponent(host)}&port=${port}`;
	return new Promise((resolve) => {
		let settled = false;
		const st = wsState();
		const ws = new WebSocket(url);
		ws.binaryType = "arraybuffer";
		st.ws = ws;
		ws.onopen = () => {
			if (settled) return;
			settled = true;
			const handle = nextWsHandle++;
			wsHandles.set(handle, st);
			resolve(handle);
		};
		ws.onmessage = (event) => {
			const chunk = new Uint8Array(event.data);
			if (chunk.length) {
				st.chunks.push(chunk);
				st.buffered += chunk.length;
			}
			wsWake(st);
		};
		ws.onclose = () => {
			st.closed = true;
			if (!settled) {
				settled = true;
				resolve(-1);
			}
			wsWake(st);
		};
		ws.onerror = () => {
			st.closed = true;
			if (!settled) {
				settled = true;
				resolve(-1);
			}
			wsWake(st);
		};
	});
}

// eslint-disable-next-line no-unused-vars
async function Java_net_runelite_browser_cheerpj_WsBridge_nRead(lib, handle, buffer, offset, len, timeoutMs) {
	const st = wsHandles.get(handle);
	if (!st) return -1;

	if (st.buffered === 0 && !st.closed) {
		const gotData = await new Promise((resolve) => {
			let done = false;
			const finish = (value) => {
				if (!done) {
					done = true;
					st.wake = null;
					resolve(value);
				}
			};
			st.wake = () => finish(true);
			if (timeoutMs > 0) setTimeout(() => finish(false), timeoutMs);
		});
		if (!gotData && st.buffered === 0 && !st.closed) {
			return -2; // WsBridge.TIMEOUT
		}
	}
	if (st.buffered === 0) {
		return st.closed ? -1 : 0;
	}

	// Copy up to `len` bytes into the Java heap by reference (Uint8Array view).
	const dest = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	let copied = 0;
	while (copied < len && st.chunks.length) {
		const head = st.chunks[0];
		const take = Math.min(head.length, len - copied);
		dest.set(head.subarray(0, take), offset + copied);
		copied += take;
		st.buffered -= take;
		if (take === head.length) st.chunks.shift();
		else st.chunks[0] = head.subarray(take);
	}
	return copied;
}

// eslint-disable-next-line no-unused-vars
function Java_net_runelite_browser_cheerpj_WsBridge_nWrite(lib, handle, buffer, offset, len) {
	const st = wsHandles.get(handle);
	if (!st || st.closed || st.ws.readyState !== WebSocket.OPEN) return -1;
	// Detach a copy: the Java heap buffer may be mutated right after this returns.
	const view = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, len);
	st.ws.send(view.slice());
	return 0;
}

// eslint-disable-next-line no-unused-vars
function Java_net_runelite_browser_cheerpj_WsBridge_nAvailable(lib, handle) {
	const st = wsHandles.get(handle);
	return st ? st.buffered : 0;
}

// eslint-disable-next-line no-unused-vars
function Java_net_runelite_browser_cheerpj_WsBridge_nClose(lib, handle) {
	const st = wsHandles.get(handle);
	if (st) {
		try {
			st.ws.close();
		} catch {
			// already closing
		}
		wsHandles.delete(handle);
	}
}

// Exposed for boot.js to hand to cheerpjInit({ natives }).
window.__socketNatives = {
	Java_net_runelite_browser_cheerpj_WsBridge_nOpen,
	Java_net_runelite_browser_cheerpj_WsBridge_nRead,
	Java_net_runelite_browser_cheerpj_WsBridge_nWrite,
	Java_net_runelite_browser_cheerpj_WsBridge_nAvailable,
	Java_net_runelite_browser_cheerpj_WsBridge_nClose,
};
