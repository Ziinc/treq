import { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from '../hooks/useTheme';

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

