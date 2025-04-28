// src/components/CodeEditor.tsx
import { useRef, useEffect } from "react";
import * as monaco from "monaco-editor";
import Editor, { OnMount } from "@monaco-editor/react";
import { Card } from "@/components/ui/card";

export interface CodeEditorProps {
  code: string;
  highlightedLine: number | null;
  onChange?: (value: string) => void;
}

export default function CodeEditor({ code, highlightedLine, onChange }: CodeEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationIdsRef = useRef<string[]>([]);

  // Set up Monaco editor reference on mount
  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    // Set initial value
    if (editor.getValue() !== code) {
      editor.setValue(code);
    }
    // Set initial highlight if present
    if (highlightedLine && highlightedLine > 0) {
      setHighlight([highlightedLine]);
    }
  };

  // Update code in editor if prop changes
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== code) {
      editorRef.current.setValue(code);
    }
  }, [code]);

  // Update highlight when highlightedLine changes
  useEffect(() => {
    if (editorRef.current) {
      if (highlightedLine && highlightedLine > 0) {
        setHighlight([highlightedLine]);
      } else {
        clearHighlight();
      }
    }
    // eslint-disable-next-line
  }, [highlightedLine]);

  function setHighlight(lines: number[]) {
    if (!editorRef.current) return;
    const decorations = lines.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: "highlight-current",
      },
    }));
    decorationIdsRef.current = editorRef.current.deltaDecorations(
      decorationIdsRef.current,
      decorations
    );
  }

  function clearHighlight() {
    if (!editorRef.current) return;
    decorationIdsRef.current = editorRef.current.deltaDecorations(
      decorationIdsRef.current,
      []
    );
  }

  return (
    <Card className="overflow-hidden">
      <Editor
        height="400px"
        defaultLanguage="javascript"
        theme="vs-dark"
        value={code}
        options={{
          readOnly: false,
          minimap: { enabled: false },
          glyphMargin: true,
          lineNumbersMinChars: 3,
        }}
        onMount={onMount}
        onChange={(value) => {
          if (onChange && typeof value === "string") {
            onChange(value);
          }
        }}
      />
    </Card>
  );
}
