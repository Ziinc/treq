import Prism from 'prismjs';

// Import languages (add more as needed)
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-elixir';
import 'prismjs/components/prism-ruby';

const extensionToLanguage: Record<string, string> = {
  '.js': 'javascript', '.mjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
  '.css': 'css',
  '.scss': 'scss',
  '.md': 'markdown',
  '.sql': 'sql',
  '.java': 'java',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp',
  '.ex': 'elixir', '.exs': 'elixir',
  '.rb': 'ruby',
  '.html': 'html', '.htm': 'html',
  '.xml': 'xml', '.svg': 'xml',
};

export function getLanguageFromPath(filePath: string): string | null {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return null;
  const ext = filePath.substring(lastDot).toLowerCase();
  return extensionToLanguage[ext] || null;
}

export function highlightCode(code: string, language: string | null): string {
  if (!code || !language) return escapeHtml(code);

  const grammar = Prism.languages[language];
  if (!grammar) return escapeHtml(code);

  try {
    return Prism.highlight(code, grammar, language);
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
