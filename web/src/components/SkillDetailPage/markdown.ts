import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

// Skill markdown comes from third-party repos, so it's rendered through
// rehype-sanitize before hitting dangerouslySetInnerHTML. remark-frontmatter
// recognizes the leading YAML block (SKILL.md's name/description) as its own
// node type so it's dropped from the render instead of showing up as a
// garbled paragraph.
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeStringify);

export function renderMarkdownToHtml(markdown: string): string {
  return String(processor.processSync(markdown));
}
