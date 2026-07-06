// @ts-check
const fs = require('fs');
const path = require('path');

/** @type {import('@docusaurus/types').PluginModule} */
function rawMarkdownPlugin(context) {
  return {
    name: 'raw-markdown-plugin',
    async loadContent() {
      const docsDir = path.join(context.siteDir, 'docs');
      const markdownData = {};

      function processDir(dir) {
        const entries = fs.readdirSync(dir, {withFileTypes: true});
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            processDir(fullPath);
          } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
            const relativePath = path.relative(context.siteDir, fullPath);
            const raw = fs.readFileSync(fullPath, 'utf8');
            markdownData[relativePath] = raw
              // strip HTML/JSX comments <!-- ... --> and {/* ... */}
              .replace(/<!--[\s\S]*?-->/g, '')
              .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
              // strip HTML tags but keep their text content
              .replace(/<[^>]+>/g, '')
              // collapse runs of blank lines left by removed blocks
              .replace(/\n{3,}/g, '\n\n')
              .trim();
          }
        }
      }

      processDir(docsDir);
      return markdownData;
    },
    async contentLoaded({content, actions}) {
      actions.setGlobalData(content);
    },
  };
}

module.exports = rawMarkdownPlugin;
