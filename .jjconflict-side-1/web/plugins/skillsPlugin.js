// @ts-check
const fs = require('fs');
const path = require('path');

// Registers one static route per catalogued skill (e.g. /skills/anthropic/pdf),
// rendering a shared SkillDetailPage component with that skill's data as props.
// This is the standard Docusaurus pattern for turning a data file into many
// pages without hand-writing one file per route.
/** @type {import('@docusaurus/types').PluginModule} */
function skillsPlugin(context) {
  return {
    name: 'skills-plugin',
    async loadContent() {
      const catalogPath = path.join(context.siteDir, 'src', 'data', 'skills.json');
      if (!fs.existsSync(catalogPath)) return [];
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      return catalog.skills;
    },
    async contentLoaded({ content: skills, actions }) {
      for (const skill of skills) {
        actions.addRoute({
          path: skill.route,
          component: '@site/src/components/SkillDetailPage/index.tsx',
          exact: true,
          props: { skill },
        });
      }
    },
  };
}

module.exports = skillsPlugin;
