import { defineConfig } from "@playwright/test";

// Locally, point at the pre-installed browser via PW_EXECUTABLE_PATH; in CI,
// `npx playwright install chromium` provides Playwright's own build (leave unset).
const executablePath = process.env["PW_EXECUTABLE_PATH"] || undefined;
const common = ["--no-sandbox"];

function launchOptions(extra: string[]): { executablePath?: string; args: string[] } {
	const args = [...common, ...extra];
	return executablePath ? { executablePath, args } : { args };
}

export default defineConfig({
	testDir: "test",
	testMatch: /.*\.e2e\.ts$/,
	timeout: 60_000,
	fullyParallel: false,
	workers: 1,
	reporter: [["list"]],
	use: { baseURL: "http://127.0.0.1:8241" },
	webServer: {
		command: "node serve.mjs",
		url: "http://127.0.0.1:8241/index.html",
		env: { PORT: "8241" },
		reuseExistingServer: false,
		timeout: 30_000,
	},
	projects: [
		{
			name: "webgl2",
			use: { launchOptions: launchOptions(["--disable-gpu"]) },
		},
		{
			name: "webgpu",
			use: {
				launchOptions: launchOptions([
					"--enable-unsafe-webgpu",
					"--enable-features=Vulkan",
					"--use-angle=vulkan",
				]),
			},
		},
	],
});
