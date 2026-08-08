// @ts-check
const fs = require('fs');
const path = require('path');

const CONTENT_SOURCES = [
  {contentPath: 'docs', routeBasePath: 'docs'},
  {contentPath: 'learn', routeBasePath: 'learn'},
];

function normalizeMarkdown(raw) {
  return raw
    .replace(/^---[\s\S]*?---\n?/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<[\s\S]*?>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function markdownOutputPath({contentPath, routeBasePath}, relativePath) {
  const parsed = path.parse(relativePath);
  const withoutExtension = path.posix.join(parsed.dir, parsed.name);
  const routePath = parsed.name === 'index' ? parsed.dir : withoutExtension;
  const outputSegments = [routeBasePath, routePath].filter(Boolean);
  return `${path.posix.join(...outputSegments)}.md`;
}

function collectMarkdownPages(siteDir, sources = CONTENT_SOURCES) {
  const pages = [];

  for (const source of sources) {
    const rootDir = path.join(siteDir, source.contentPath);
    if (!fs.existsSync(rootDir)) continue;

    function processDir(dir) {
      const entries = fs.readdirSync(dir, {withFileTypes: true});
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          processDir(fullPath);
          continue;
        }

        if (!entry.name.endsWith('.md') && !entry.name.endsWith('.mdx')) continue;

        const relativePath = path.relative(rootDir, fullPath).split(path.sep).join(path.posix.sep);
        const raw = fs.readFileSync(fullPath, 'utf8');
        pages.push({
          sourcePath: path.relative(siteDir, fullPath).split(path.sep).join(path.posix.sep),
          outputPath: markdownOutputPath(source, relativePath),
          content: normalizeMarkdown(raw),
        });
      }
    }

    processDir(rootDir);
  }

  return pages;
}

/** @type {import('@docusaurus/types').PluginModule} */
function rawMarkdownPlugin(context) {
  return {
    name: 'raw-markdown-plugin',
    async loadContent() {
      return collectMarkdownPages(context.siteDir);
    },
    async contentLoaded({content, actions}) {
      actions.setGlobalData(
        Object.fromEntries(content.map((page) => [page.sourcePath, page.content])),
      );
    },
    async postBuild({outDir, content}) {
      for (const page of content) {
        const outputFile = path.join(outDir, page.outputPath);
        fs.mkdirSync(path.dirname(outputFile), {recursive: true});
        fs.writeFileSync(outputFile, `${page.content}\n`, 'utf8');
      }
    },
  };
}

module.exports = rawMarkdownPlugin;
module.exports.normalizeMarkdown = normalizeMarkdown;
module.exports.markdownOutputPath = markdownOutputPath;
module.exports.collectMarkdownPages = collectMarkdownPages;
