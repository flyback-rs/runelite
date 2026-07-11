import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, isAllowed, parseRules } from "../src/allowlist.ts";

describe("allowlist", () => {
	it("permits OSRS worlds on the game port by default", () => {
		expect(isAllowed("oldschool1.runescape.com", 43594, DEFAULT_RULES)).toBe(true);
		expect(isAllowed("oldschool42.runescape.com", 43594, DEFAULT_RULES)).toBe(true);
		expect(isAllowed("oldschool.runescape.com", 43594, DEFAULT_RULES)).toBe(true);
	});

	it("rejects other hosts, ports, and out-of-range ports", () => {
		expect(isAllowed("evil.example.com", 43594, DEFAULT_RULES)).toBe(false);
		expect(isAllowed("oldschool1.runescape.com", 25565, DEFAULT_RULES)).toBe(false);
		expect(isAllowed("oldschool1.runescape.com.evil.com", 43594, DEFAULT_RULES)).toBe(false);
		expect(isAllowed("oldschool1.runescape.com", 0, DEFAULT_RULES)).toBe(false);
		expect(isAllowed("oldschool1.runescape.com", 70000, DEFAULT_RULES)).toBe(false);
	});

	it("parses a custom glob spec with wildcard ports", () => {
		const rules = parseRules("*.runescape.com:43594,127.0.0.1:*");
		expect(isAllowed("world1.runescape.com", 43594, rules)).toBe(true);
		expect(isAllowed("127.0.0.1", 12345, rules)).toBe(true);
		expect(isAllowed("world1.runescape.com", 80, rules)).toBe(false);
		expect(isAllowed("elsewhere.com", 43594, rules)).toBe(false);
	});

	it("falls back to the defaults for an empty spec", () => {
		expect(parseRules(undefined)).toBe(DEFAULT_RULES);
		expect(parseRules("")).toBe(DEFAULT_RULES);
	});
});
