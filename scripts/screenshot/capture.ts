/**
 * Rasterizes a jsdom-rendered DOM snapshot into a PNG.
 *
 * jsdom (used by the integration test harness) drives real app logic and
 * produces a real DOM, but never paints pixels. This takes the serialized
 * document, inlines the app's compiled Tailwind CSS, and hands the resulting
 * static HTML to a real headless browser (Chromium via playwright-core) just
 * to rasterize it.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const GENERATED_DIR = path.join(__dirname, ".generated");
const CSS_PATH = path.join(GENERATED_DIR, "app.css");
const CHROMIUM_EXECUTABLE =
	process.env.PLAYWRIGHT_CHROMIUM_PATH ??
	"/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export type CaptureOptions = {
	/** Base file name (no extension) for the .html/.png written under .generated/ */
	name: string;
	viewport?: { width: number; height: number };
};

export async function captureDocument(
	doc: Document,
	options: CaptureOptions,
): Promise<string> {
	const { name, viewport = { width: 1440, height: 900 } } = options;

	if (!fs.existsSync(CSS_PATH)) {
		throw new Error(
			`Missing compiled CSS at ${CSS_PATH}. Run \`npm run screenshot:css\` first.`,
		);
	}
	const css = fs.readFileSync(CSS_PATH, "utf8");

	const htmlClass = doc.documentElement.className;
	const bodyHtml = doc.body.innerHTML;

	const html = `<!doctype html>
<html class="${htmlClass}">
<head>
<meta charset="utf-8" />
<style>
html, body { margin: 0; padding: 0; }
${css}
</style>
</head>
<body class="${doc.body.className}">${bodyHtml}</body>
</html>`;

	fs.mkdirSync(GENERATED_DIR, { recursive: true });
	const htmlPath = path.join(GENERATED_DIR, `${name}.html`);
	const pngPath = path.join(GENERATED_DIR, `${name}.png`);
	fs.writeFileSync(htmlPath, html);

	const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
	try {
		const page = await browser.newPage({ viewport });
		await page.goto(`file://${htmlPath}`);
		await page.screenshot({ path: pngPath });
	} finally {
		await browser.close();
	}

	return pngPath;
}
