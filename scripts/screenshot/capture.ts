/**
 * Rasterizes a jsdom-rendered DOM snapshot into a PNG.
 *
 * jsdom (used by the integration test harness) drives real app logic and
 * produces a real DOM, but never paints pixels. This takes the serialized
 * document, inlines the app's compiled Tailwind CSS, and hands the resulting
 * static HTML to a real headless browser (Chromium via playwright-core) just
 * to rasterize it.
 *
 * Every capture also carries `expectations`: plain-English claims about what
 * the rendered image should show (not DOM/testing-library assertions -- the
 * spec's own screen.findBy and expect calls already prove the DOM state
 * before capture). These are written to a `<name>.json` manifest next to the
 * PNG so an agent doing visual QA has a concrete checklist to verify against
 * the picture -- read the PNG, then confirm or refute each expectation by
 * looking at it.
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
	/** Base file name (no extension) for the .html/.png/.json written under .generated/ */
	name: string;
	viewport?: { width: number; height: number };
	/**
	 * Non-empty: what a viewer should be able to confirm by looking at this
	 * screenshot, e.g. "The 'Push to remote' button is not visible in the
	 * header" or "A green toast reading 'Pushed to remote' is shown". These
	 * are checked visually against the PNG, not against the DOM.
	 */
	expectations: string[];
	/**
	 * CSS selector for an element to scroll into view before rasterizing.
	 * jsdom's scrollTop never carries into the re-rendered static HTML, so a
	 * target sitting below the fold of a scrollable region (e.g. the cmdk
	 * list's `overflow-y-auto`) is otherwise clipped out of the screenshot
	 * even though it's present in the DOM.
	 */
	scrollIntoView?: string;
};

export async function captureDocument(
	doc: Document,
	options: CaptureOptions,
): Promise<string> {
	const {
		name,
		viewport = { width: 1440, height: 900 },
		expectations,
		scrollIntoView,
	} = options;

	if (!expectations || expectations.length === 0) {
		throw new Error(
			`captureDocument("${name}") requires a non-empty "expectations" list -- ` +
				"plain-English claims about what this screenshot should show, for an " +
				"agent to verify visually. See the app-qa skill.",
		);
	}

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
	const manifestPath = path.join(GENERATED_DIR, `${name}.json`);
	fs.writeFileSync(htmlPath, html);

	const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
	try {
		const page = await browser.newPage({ viewport });
		await page.goto(`file://${htmlPath}`);
		if (scrollIntoView) {
			await page.locator(scrollIntoView).first().scrollIntoViewIfNeeded();
		}
		await page.screenshot({ path: pngPath });
	} finally {
		await browser.close();
	}

	fs.writeFileSync(
		manifestPath,
		JSON.stringify(
			{
				name,
				capturedAt: new Date().toISOString(),
				expectations,
			},
			null,
			2,
		),
	);

	return pngPath;
}
