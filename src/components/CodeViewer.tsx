// src/components/CodeViewer.tsx
import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react'; // Add useRef, useEffect
import * as monaco from 'monaco-editor';
import Editor, { OnMount } from '@monaco-editor/react';
import { Frame } from './CallStackPanel'; // Import Frame interface

// Define the structure for a highlight
export type HighlightType = 'current' | 'return' | 'call';
export interface Highlight {
  line: number;
  type: HighlightType;
}

export interface CodeViewerHandle {
  // Replace highlightLine with setHighlights
  setHighlights(highlights: Highlight[]): void;
  reset(): void;
}

export interface CodeViewerProps {
  code: string;
  // Add props for hover context
  globals: Record<string, any>;
  frames: Frame[];
  // Prop for highlights (passed from App.tsx)
  highlights: Highlight[];
}

export const CodeViewer = forwardRef<CodeViewerHandle, CodeViewerProps>(({ code, globals, frames, highlights }, ref) => {
  // Use refs to store editor instance and hover provider registration
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const hoverProviderRef = useRef<monaco.IDisposable | null>(null);
  const decorationIdsRef = useRef<string[]>([]); // Use ref for decorations

  // Function to find variable value in current scope
  const findValueInScope = (identifier: string): any => {
    // Search frames from top (most recent) down
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i].locals && identifier in frames[i].locals) {
        return frames[i].locals[identifier];
      }
    }
    // Check globals if not found in frames
    if (globals && identifier in globals) {
      return globals[identifier];
    }
    return undefined; // Not found
  };

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;

    // Dispose previous provider if exists
    if (hoverProviderRef.current) {
      hoverProviderRef.current.dispose();
    }

    // Register hover provider
    hoverProviderRef.current = monaco.languages.registerHoverProvider('javascript', {
      provideHover: (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return;

        const identifier = word.word;
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const value = findValueInScope(identifier);

        // Check if it's potentially a function call
        const lineContent = model.getLineContent(position.lineNumber);
        const charAfterWord = lineContent.charAt(word.endColumn - 1); // Monaco columns are 1-based

        if (charAfterWord === '(' && typeof value === 'function') {
          // It's likely a function call hover
          // TODO: Enhance with actual signature and return line (needs more context)
          return {
            range: range,
            contents: [
              { value: `**(function) ${identifier}**` },
              // Placeholder for future enhancement:
              // { value: `Args: ${JSON.stringify(args)}` },
              // { value: `Returns to line: ${returnLine}` }
            ]
          };
        } else if (value !== undefined) {
          // It's a variable hover
          return {
            range: range,
            contents: [
              { value: `**${identifier}**: \`${JSON.stringify(value)}\`` } // Markdown format
            ]
          };
        }
        return; // No hover info if value not found or not a function call
      }
    });
  };

  // Effect to update editor value if code prop changes
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== code) {
      editorRef.current.setValue(code);
    }
  }, [code]);

  // Effect to clean up hover provider on unmount
  useEffect(() => {
    return () => {
      hoverProviderRef.current?.dispose();
    };
  }, []);


  useImperativeHandle(ref, () => ({
    setHighlights(newHighlights: Highlight[]) {
      const editor = editorRef.current;
      if (!editor) return;
      const newDecorations = newHighlights.map(h => {
        let className = '';
        switch (h.type) {
          case 'current': className = 'highlight-current'; break;
          case 'return': className = 'highlight-return'; break;
          case 'call': className = 'highlight-call'; break;
          default: className = 'highlight-current';
        }
        return {
          range: new monaco.Range(h.line, 1, h.line, 1),
          options: { isWholeLine: true, className }
        };
      });
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, newDecorations);
    },
    reset() {
      const editor = editorRef.current;
      if (!editor) return;
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
    }
  }), []);

  return (
    <Editor
      height="400px"
      defaultLanguage="javascript"
      theme="vs-dark"
      value={code}
      options={{ readOnly: true, minimap: { enabled: false } }}
      onMount={onMount}
    />
  );
});
