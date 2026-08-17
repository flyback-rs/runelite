import type { EngineStatus } from "./shell.ts";

declare global {
	interface Window {
		runelitePublishPanel?: (pluginId: string, json: string) => void;
		__runelite?: EngineStatus;
	}
}
