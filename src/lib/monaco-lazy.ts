import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

let monacoInitialized = false;

/**
 * Lazy-loads and initializes Monaco Editor only when needed.
 * This prevents Monaco from being loaded at app startup, improving initial load time.
 * 
 * @returns Promise that resolves when Monaco is ready to use
 */
export async function initializeMonaco(): Promise<void> {
  if (monacoInitialized) {
    return;
  }

  // Import Monaco core without full bundle
  const monaco = await import('monaco-editor/esm/vs/editor/editor.api');

  // Explicitly import only the languages we need
  await import('monaco-editor/esm/vs/language/typescript/monaco.contribution');
  await import('monaco-editor/esm/vs/language/json/monaco.contribution');
  await import('monaco-editor/esm/vs/language/html/monaco.contribution');
  await import('monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution');
  await import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution');

  // Import essential editor features
  await import('monaco-editor/esm/vs/editor/contrib/find/browser/findController');
  await import('monaco-editor/esm/vs/editor/contrib/folding/browser/folding');
  await import('monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching');
  await import('monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard');
  await import('monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations');

  // Configure Monaco Environment for worker loading
  (self as any).MonacoEnvironment = {
    getWorker(_: any, label: string) {
      // TypeScript/JavaScript worker
      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker();
      }
      // Default editor worker (handles markdown, HTML, etc.)
      return new editorWorker();
    },
  };

  // Configure @monaco-editor/react loader to use bundled Monaco
  loader.config({ monaco });

  monacoInitialized = true;
}


