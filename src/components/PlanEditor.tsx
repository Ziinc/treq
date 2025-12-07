import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from '../hooks/useTheme';
import { initializeMonaco } from '../lib/monaco-lazy';

interface PlanEditorProps {
  content: string;
  onChange?: (value: string) => void;
  height?: string;
  readOnly?: boolean;
}

export const PlanEditor: React.FC<PlanEditorProps> = ({
  content,
  onChange,
  height = '400px',
  readOnly = false,
}) => {
  const { actualTheme } = useTheme();
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const [isMonacoReady, setIsMonacoReady] = useState(false);

  useEffect(() => {
    initializeMonaco().then(() => {
      setIsMonacoReady(true);
    });
  }, []);

  const handleEditorChange = (value: string | undefined) => {
    if (!onChange || readOnly) return;
    
    // Debounce onChange events to avoid excessive saves
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      if (value !== undefined) {
        onChange(value);
      }
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  if (!isMonacoReady) {
    return (
      <div className="border rounded-md overflow-hidden flex items-center justify-center" style={{ height }}>
        <div className="text-sm text-muted-foreground">Loading editor...</div>
      </div>
    );
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <Editor
        height={height}
        defaultLanguage="markdown"
        value={content}
        onChange={handleEditorChange}
        theme={actualTheme === 'dark' ? 'vs-dark' : 'light'}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          wrappingIndent: 'indent',
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: 'line',
          smoothScrolling: true,
        }}
      />
    </div>
  );
};

