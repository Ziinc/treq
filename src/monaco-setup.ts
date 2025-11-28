import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Import Monaco core without full bundle
import 'monaco-editor/esm/vs/editor/editor.api';

// Explicitly import only the languages we need
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import 'monaco-editor/esm/vs/language/html/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';

// Import essential editor features
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations';

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
// We need to import monaco again for the loader config
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
loader.config({ monaco });
