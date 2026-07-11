import { parseRules } from "./allowlist.ts";
import { createGateway, listen } from "./gateway.ts";

const port = Number(process.env["PORT"] ?? 8090);
const rules = parseRules(process.env["GATEWAY_ALLOW"]);
const host = process.env["HOST"] ?? "0.0.0.0";

const server = createGateway({ rules });
await listen(server, port, host);
console.log(
	`gateway listening on ${host}:${port}; allowlist:`,
	rules.map((rule) => `${rule.host.source}:${rule.port === -1 ? "*" : rule.port}`).join(", "),
);
