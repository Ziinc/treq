// @ts-check
const fs = require('fs');
const path = require('path');

/** @type {import('@docusaurus/types').PluginModule} */
function versionPlugin(context) {
  const pkgPath = path.resolve(context.siteDir, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version;

  return {
    name: 'version-plugin',
    configureWebpack() {
      return {
        devServer: {
          setupMiddlewares(middlewares, devServer) {
            devServer.app.get('/version', (_req, res) => {
              res.setHeader('Content-Type', 'text/plain');
              res.end(`${version}\n`);
            });
            return middlewares;
          },
        },
      };
    },
    async postBuild({outDir}) {
      fs.writeFileSync(path.join(outDir, 'version'), `${version}\n`, 'utf8');
    },
  };
}

module.exports = versionPlugin;
