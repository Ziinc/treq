#!/usr/bin/env node
/**
 * Rasterizes Storybook stories to PNGs so an agent can visually confirm a
 * component tweak before/after, the same way scripts/screenshot/ does for
 * full-app flows (see the app-qa skill). Storybook's static build already
 * serves each story in isolation at iframe.html?id=<story-id>&viewMode=story
 * -- this just serves storybook-static/ locally and screenshots the
 * requested stories with the same headless Chromium used elsewhere in the
 * repo.
 *
 * Usage:
 *   npm run build-storybook
 *   node scripts/storybook/screenshot.mjs [file-or-id ...]
 *
 * Each arg is either a *.stories.tsx path (repo-relative, screenshots every
 * story it exports) or an exact story id (e.g. ui-button--default). No args
 * screenshots every story. Each story is captured once in light and once in
 * dark (the toolbar theme global from .storybook/preview.tsx), written to
 * scripts/storybook/.generated/<story-id>.<light|dark>.png, alongside a
 * manifest.json listing what was captured.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const storybookDir = path.join(repoRoot, "storybook-static");
const outDir = path.join(__dirname, ".generated");
const CHROMIUM_EXECUTABLE =
	process.env.PLAYWRIGHT_CHROMIUM_PATH ??
	"/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const MIME_TYPES = {
	".html": "text/html",
	".js": "text/javascript",
	".mjs": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".woff2": "font/woff2",
};

function serveStatic(rootDir) {
	const server = http.createServer((req, res) => {
		const reqPath = decodeURIComponent(req.url.split("?")[0]);
		const filePath = path.join(
			rootDir,
			reqPath === "/" ? "/index.html" : reqPath,
		);
		if (!filePath.startsWith(rootDir)) {
			res.writeHead(403);
			res.end();
			return;
		}
		fs.readFile(filePath, (err, data) => {
			if (err) {
				res.writeHead(404);
				res.end();
				return;
			}
			const ext = path.extname(filePath);
			res.writeHead(200, {
				"Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
			});
			res.end(data);
		});
	});
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve(server));
	});
}

function loadIndex() {
	const indexPath = path.join(storybookDir, "index.json");
	if (!fs.existsSync(indexPath)) {
		throw new Error(
			`Missing ${indexPath} -- run \`npm run build-storybook\` first.`,
		);
	}
	return JSON.parse(fs.readFileSync(indexPath, "utf8"));
}

function selectStories(index, args) {
	const stories = Object.values(index.entries).filter(
		(e) => e.type === "story",
	);
	if (args.length === 0) return stories;

	const byId = new Map(stories.map((s) => [s.id, s]));
	const byImportPath = new Map();
	for (const s of stories) {
		const p = s.importPath.replace(/^\.\//, "");
		if (!byImportPath.has(p)) byImportPath.set(p, []);
		byImportPath.get(p).push(s);
	}

	const selected = [];
	for (const arg of args) {
		if (byId.has(arg)) {
			selected.push(byId.get(arg));
		} else if (byImportPath.has(arg)) {
			selected.push(...byImportPath.get(arg));
		} else {
			throw new Error(
				`No story or story file matched "${arg}". Pass a *.stories.tsx path (repo-relative) or a story id from storybook-static/index.json.`,
			);
		}
	}
	return selected;
}

async function main() {
	const args = process.argv.slice(2);
	const index = loadIndex();
	const stories = selectStories(index, args);

	if (stories.length === 0) {
		console.log("No stories to screenshot.");
		return;
	}

	fs.mkdirSync(outDir, { recursive: true });
	const server = await serveStatic(storybookDir);
	const { port } = server.address();

	const browser = await chromium.launch({
		executablePath: CHROMIUM_EXECUTABLE,
	});
	const manifest = [];
	try {
		const page = await browser.newPage({
			viewport: { width: 1024, height: 768 },
		});
		for (const story of stories) {
			for (const theme of ["light", "dark"]) {
				const url = `http://127.0.0.1:${port}/iframe.html?id=${story.id}&viewMode=story&globals=theme:${theme}`;
				await page.goto(url, { waitUntil: "networkidle" });
				const fileName = `${story.id}.${theme}.png`;
				await page.screenshot({ path: path.join(outDir, fileName) });
				manifest.push({
					id: story.id,
					title: story.title,
					name: story.name,
					theme,
					file: fileName,
				});
				console.log(`Captured ${story.title} — ${story.name} (${theme})`);
			}
		}
	} finally {
		await browser.close();
		server.close();
	}

	fs.writeFileSync(
		path.join(outDir, "manifest.json"),
		JSON.stringify(manifest, null, 2),
	);
	console.log(`\nWrote ${manifest.length} screenshots to ${outDir}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
