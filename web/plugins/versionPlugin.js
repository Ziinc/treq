// @ts-check
const fs = require('fs');
const path = require('path');

/** @type {import('@docusaurus/types').PluginModule} */
function versionPlugin(context) {
  return {
    name: 'version-plugin',
    async postBuild({outDir}) {
      const pkgPath = path.resolve(context.siteDir, '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      fs.writeFileSync(path.join(outDir, 'version'), `${pkg.version}\n`, 'utf8');
    },
  };
}

module.exports = versionPlugin;
