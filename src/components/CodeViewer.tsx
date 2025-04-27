// src/components/CodeViewer.tsx
import { forwardRef, useImperativeHandle } from 'react';
import * as monaco from 'monaco-editor';
import Editor, { OnMount } from '@monaco-editor/react';

export interface CodeViewerHandle {
  highlightLine(line: number): void;
  reset(): void;
}

export interface CodeViewerProps {
  code: string;
}

export const CodeViewer = forwardRef<CodeViewerHandle, CodeViewerProps>(({ code }, ref) => {
  let editor: monaco.editor.IStandaloneCodeEditor | null = null;
  let decorationIds: string[] = [];

  const onMount: OnMount = (ed) => {
    editor = ed;
  };

  useImperativeHandle(ref, () => ({
    highlightLine(line: number) {
      if (!editor) return;
      decorationIds = editor.deltaDecorations(decorationIds, [
        {
          range: new monaco.Range(line, 1, line, 1),
          options: { isWholeLine: true, className: 'myHighlightLine' }
        }
      ]);
    },
    reset() {
      if (!editor) return;
      decorationIds = editor.deltaDecorations(decorationIds, []);
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
