// @ts-check
const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

/** @type {import('@docusaurus/types').PluginModule} */
function landingScreenshotsPlugin(context) {
  return {
    name: 'landing-screenshots-plugin',
    async loadContent() {
      if (process.env.SKIP_LANDING_SCREENSHOTS === '1') {
        return;
      }
      if (process.env.NODE_ENV !== 'production') {
        return;
      }

      const landingDir = path.join(context.siteDir, 'static', 'img', 'landing');
      const listPath = path.join(
        context.siteDir,
        'src',
        'data',
        'landing-screenshots.json',
      );
      const files = JSON.parse(fs.readFileSync(listPath, 'utf8'));
      fs.mkdirSync(landingDir, {recursive: true});

      const missing = files.filter(
        (name) => !fs.existsSync(path.join(landingDir, name)),
      );
      if (missing.length === 0 && process.env.FORCE_LANDING_SCREENSHOTS !== '1') {
        return;
      }

      const repoRoot = path.resolve(context.siteDir, '..');
      const result = spawnSync('npm', ['run', 'screenshot:readme'], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: process.env,
        shell: false,
      });
      if (result.status !== 0) {
        const stillMissing = files.filter(
          (name) => !fs.existsSync(path.join(landingDir, name)),
        );
        if (stillMissing.length > 0) {
          console.warn(
            `[landing-screenshots] screenshot:readme exited ${result.status}. Missing: ${stillMissing.join(', ')}. Set SKIP_LANDING_SCREENSHOTS=1 to skip.`,
          );
        }
      }
    },
  };
}

module.exports = landingScreenshotsPlugin;
