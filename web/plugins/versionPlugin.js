// @ts-check
const fs = require('fs');
const path = require('path');

/** @type {import('@docusaurus/types').PluginModule} */
function versionPlugin(context) {
  return {
    name: 'version-plugin',
    async loadContent() {
      const pkgPath = path.resolve(context.siteDir, '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const dest = path.join(context.siteDir, 'static', 'version');
      fs.writeFileSync(dest, `${pkg.version}\n`, 'utf8');
    },
  };
}

module.exports = versionPlugin;
