/**
 * Destination allowlist. The gateway only opens TCP connections to hosts/ports
 * that match a rule, so it cannot be turned into an open proxy.
 */

export interface AllowRule {
	readonly host: RegExp;
	readonly port: number;
}

/**
 * Default: any OSRS world on the game/JS5 port (43594) and on 443, the
 * firewall-friendly fallback port the client also accepts game traffic on.
 */
export const DEFAULT_RULES: readonly AllowRule[] = [
	{ host: /^oldschool\d*\.runescape\.com$/i, port: 43594 },
	{ host: /^oldschool\d*\.runescape\.com$/i, port: 443 },
];

/**
 * Parses a `GATEWAY_ALLOW` spec: comma-separated `host-glob:port`, where the host
 * glob allows `*` wildcards (e.g. `*.runescape.com:43594,127.0.0.1:*`). Returns
 * the defaults when the spec is empty.
 */
export function parseRules(spec: string | undefined): readonly AllowRule[] {
	if (!spec || spec.trim() === "") {
		return DEFAULT_RULES;
	}
	return spec
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.map((entry) => {
			const sep = entry.lastIndexOf(":");
			const hostGlob = sep === -1 ? entry : entry.slice(0, sep);
			const portText = sep === -1 ? "*" : entry.slice(sep + 1);
			const pattern = hostGlob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
			return {
				host: new RegExp(`^${pattern}$`, "i"),
				port: portText === "*" ? -1 : Number(portText),
			};
		});
}

/** Whether a connection to host:port is permitted (`port === -1` rule = any port). */
export function isAllowed(host: string, port: number, rules: readonly AllowRule[]): boolean {
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		return false;
	}
	return rules.some((rule) => rule.host.test(host) && (rule.port === -1 || rule.port === port));
}
