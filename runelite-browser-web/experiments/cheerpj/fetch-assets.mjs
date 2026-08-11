// Fetches everything the CheerpJ boot needs into lib/ (git-ignored):
//   - jav_config.ws from Jagex, parsed into lib/config.json
//   - the vanilla gamepack jar named by the config
//   - the cheerpj-boot.jar shim built by ../../../runelite-browser-cheerpj
//   - with --injected: RuneLite's injected-client + runelite-api from repo.runelite.net
//
// Usage: node fetch-assets.mjs [--injected] [--world N]

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const lib = resolve(root, "lib");
const bootJar = resolve(root, "../../../runelite-browser-cheerpj/build/libs/cheerpj-boot.jar");

const injected = process.argv.includes("--injected");
const worldArg = process.argv.indexOf("--world");
const world = worldArg !== -1 ? Number(process.argv[worldArg + 1]) : null;

const JAV_CONFIG_URL = world
	? `https://oldschool${world}.runescape.com/jav_config.ws`
	: "https://oldschool.runescape.com/jav_config.ws";
const RUNELITE_REPO = "https://repo.runelite.net/net/runelite";
const MAVEN = "https://repo1.maven.org/maven2";

// The injected client is compiled against RuneLite's runtime classpath. It
// bundles BouncyCastle already, but needs these from Maven Central (versions
// pinned to RuneLite's libs.versions.toml). slf4j-simple is a logging binding so
// the client's own logs surface in the browser console — handy for debugging.
const INJECTED_DEPS = [
	{ path: "org/slf4j/slf4j-api/1.7.25/slf4j-api-1.7.25.jar", file: "slf4j-api-1.7.25.jar" },
	{ path: "org/slf4j/slf4j-simple/1.7.25/slf4j-simple-1.7.25.jar", file: "slf4j-simple-1.7.25.jar" },
	{ path: "com/google/guava/guava/23.2-jre/guava-23.2-jre.jar", file: "guava-23.2-jre.jar" },
	{ path: "org/json/json/20231013/json-20231013.jar", file: "json-20231013.jar" },
];

async function text(url) {
	const response = await fetch(url, { redirect: "follow" });
	if (!response.ok) {
		throw new Error(`${url}: HTTP ${response.status}`);
	}
	return response.text();
}

async function download(url, file) {
	const response = await fetch(url, { redirect: "follow" });
	if (!response.ok) {
		throw new Error(`${url}: HTTP ${response.status}`);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	writeFileSync(file, bytes);
	console.log(`  ${file} (${(bytes.length / 1024 / 1024).toFixed(1)} MB) <- ${url}`);
}

// jav_config.ws lines: `param=key=value` are applet parameters; `msg=` are UI
// strings (skipped); everything else configures the loader (codebase,
// initial_jar, initial_class, ...). Mirrors RuneLite's ClientConfigLoader.
function parseJavConfig(body) {
	const loader = {};
	const params = {};
	for (const line of body.split(/\r?\n/)) {
		const eq = line.indexOf("=");
		if (eq === -1) {
			continue;
		}
		const key = line.slice(0, eq);
		const value = line.slice(eq + 1);
		if (key === "param") {
			const inner = value.indexOf("=");
			params[value.slice(0, inner)] = value.slice(inner + 1);
		} else if (key !== "msg") {
			loader[key] = value;
		}
	}
	return { loader, params };
}

async function latestRuneLiteVersion(artifact) {
	const metadata = await text(`${RUNELITE_REPO}/${artifact}/maven-metadata.xml`);
	const release = metadata.match(/<release>([^<]+)<\/release>/)?.[1];
	if (!release) {
		throw new Error(`no <release> in ${artifact} maven-metadata.xml`);
	}
	return release;
}

mkdirSync(lib, { recursive: true });

console.log(`fetching ${JAV_CONFIG_URL}`);
const { loader, params } = parseJavConfig(await text(JAV_CONFIG_URL));
if (!loader["codebase"] || !loader["initial_jar"]) {
	throw new Error("jav_config missing codebase/initial_jar");
}

console.log(`gamepack: ${loader["initial_jar"]} from ${loader["codebase"]}`);
await download(new URL(loader["initial_jar"], loader["codebase"]).href, resolve(lib, "gamepack.jar"));

const injectedClasspath = [];
if (injected) {
	const clientVersion = await latestRuneLiteVersion("injected-client");
	const apiVersion = await latestRuneLiteVersion("runelite-api");
	console.log(`runelite injected-client ${clientVersion}, runelite-api ${apiVersion}`);
	await download(
		`${RUNELITE_REPO}/injected-client/${clientVersion}/injected-client-${clientVersion}.jar`,
		resolve(lib, "injected-client.jar"),
	);
	await download(
		`${RUNELITE_REPO}/runelite-api/${apiVersion}/runelite-api-${apiVersion}.jar`,
		resolve(lib, "runelite-api.jar"),
	);
	injectedClasspath.push("/app/lib/injected-client.jar", "/app/lib/runelite-api.jar");

	for (const dep of INJECTED_DEPS) {
		await download(`${MAVEN}/${dep.path}`, resolve(lib, dep.file));
		injectedClasspath.push(`/app/lib/${dep.file}`);
	}
}

if (!existsSync(bootJar)) {
	throw new Error(
		`missing ${bootJar} — build it first: gradle -p ../../../runelite-browser-cheerpj jar`,
	);
}
copyFileSync(bootJar, resolve(lib, "cheerpj-boot.jar"));
console.log(`  lib/cheerpj-boot.jar <- ${bootJar}`);

writeFileSync(
	resolve(lib, "config.json"),
	JSON.stringify(
		{
			codebase: loader["codebase"],
			initialClass: loader["initial_class"] ?? "client.class",
			width: Number(params["applet_minwidth"] ?? loader["applet_minwidth"] ?? 765),
			height: Number(params["applet_minheight"] ?? loader["applet_minheight"] ?? 503),
			injectedClasspath,
			params,
		},
		null,
		"\t",
	),
);
console.log("  lib/config.json");
console.log("done — now: node serve.mjs, then open http://localhost:8095");
