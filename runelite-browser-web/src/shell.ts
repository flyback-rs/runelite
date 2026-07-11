/** State the shell reflects and the E2E test reads via `window.__runelite`. */
export interface EngineStatus {
	backend: string;
	ready: boolean;
	frameCount: number;
	medianMs: number;
	sample: number[] | null;
	batchCount: number;
	glyphCount: number;
	glyphAtlas: boolean;
	uiLayer: boolean;
	error: string | null;
}

export interface Shell {
	readonly canvas: HTMLCanvasElement;
	readonly hud: HTMLElement;
	readonly sidebar: HTMLElement;
}

interface PanelComponent {
	type: string;
	id: string | null;
	text: string | null;
	value: string | null;
}
interface PanelModelJson {
	pluginId: string;
	title: string;
	components: PanelComponent[];
}

/** Builds the DOM: game viewport (canvas + HUD) and a plugin sidebar. */
export function buildShell(): Shell {
	document.body.innerHTML = "";
	injectStyles();

	const root = element("div", "rl-root");
	const viewport = element("div", "rl-viewport");
	const canvas = document.createElement("canvas");
	canvas.className = "rl-canvas";
	const hud = element("div", "rl-hud");
	hud.textContent = "starting…";
	viewport.append(canvas, hud);

	const sidebar = element("aside", "rl-sidebar");
	root.append(viewport, sidebar);
	document.body.append(root);

	return { canvas, hud, sidebar };
}

export function updateHud(hud: HTMLElement, status: EngineStatus): void {
	if (status.error) {
		hud.textContent = `error: ${status.error}`;
		hud.dataset["state"] = "error";
		return;
	}
	const fps = status.medianMs > 0 ? Math.round(1000 / status.medianMs) : 0;
	hud.dataset["state"] = "ok";
	hud.textContent = `${status.backend} · ${fps} fps · ${status.medianMs.toFixed(2)} ms · frame ${status.frameCount}`;
}

/**
 * Installs the DOM panel host used by the platform UI contract
 * (`window.runelitePublishPanel(pluginId, json)`), rendering a declarative
 * PanelModel as DOM in the sidebar. Shared with part 1's contract.
 */
export function installPanelHost(sidebar: HTMLElement): (pluginId: string, json: string) => void {
	const publish = (pluginId: string, json: string): void => {
		const model = JSON.parse(json) as PanelModelJson;
		const existing = document.getElementById(`panel-${pluginId}`);
		existing?.remove();

		const panel = element("section", "rl-panel");
		panel.id = `panel-${pluginId}`;
		const title = element("header", "rl-panel-title");
		title.textContent = model.title;
		panel.append(title);
		for (const component of model.components) {
			panel.append(renderComponent(component));
		}
		sidebar.append(panel);
	};
	window.runelitePublishPanel = publish;
	return publish;
}

function renderComponent(component: PanelComponent): HTMLElement {
	switch (component.type) {
		case "SECTION": {
			const node = element("div", "rl-c-section");
			node.textContent = component.text ?? "";
			return node;
		}
		case "BUTTON": {
			const node = element("button", "rl-c-button");
			node.textContent = component.text ?? "";
			return node;
		}
		default: {
			const node = element("div", "rl-c-label");
			node.textContent = component.value
				? `${component.text}: ${component.value}`
				: (component.text ?? "");
			return node;
		}
	}
}

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.className = className;
	return node;
}

function injectStyles(): void {
	const style = document.createElement("style");
	style.textContent = `
		:root { color-scheme: dark; }
		* { box-sizing: border-box; }
		body { margin: 0; font-family: system-ui, sans-serif; background: #16161a; color: #e6e6e6; }
		.rl-root { display: flex; height: 100vh; }
		.rl-viewport { position: relative; flex: 1 1 auto; min-width: 0; }
		.rl-canvas { display: block; width: 100%; height: 100%; }
		.rl-hud { position: absolute; top: 8px; left: 8px; padding: 4px 8px; border-radius: 4px;
			background: rgba(0,0,0,.55); font: 12px/1.4 ui-monospace, monospace; color: #9ad; }
		.rl-hud[data-state="error"] { color: #f88; }
		.rl-sidebar { flex: 0 0 240px; overflow-y: auto; background: #1e1e24; border-left: 1px solid #33343c; }
		.rl-panel { border-bottom: 1px solid #33343c; }
		.rl-panel-title { padding: 8px 12px; font-weight: 600; border-bottom: 1px solid #33343c; }
		.rl-c-section { padding: 8px 12px 2px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #8a8a94; }
		.rl-c-label { padding: 2px 12px; font-size: 13px; }
		.rl-c-button { margin: 6px 12px; padding: 4px 10px; }
	`;
	document.head.append(style);
}
