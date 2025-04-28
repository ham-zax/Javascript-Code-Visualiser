// src/components/CodeEditor.tsx
import { useRef, useEffect } from "react";
import * as monaco from "monaco-editor";
import Editor, { OnMount } from "@monaco-editor/react";
import { Card } from "@/components/ui/card";

/**
 * Props for CodeEditor supporting dual line highlighting.
 * highlightInfo: { nextLine, prevLine } for execution visualization.
 */
export interface CodeEditorProps {
  code: string;
  highlightInfo: {
    nextLine: number | null;
    prevLine: number | null;
  };
  onChange?: (value: string) => void;
}

/**
 * CodeEditor component with dual line highlighting for execution visualization.
 */
export default function CodeEditor({ code, highlightInfo, onChange }: CodeEditorProps) {
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
    // Set initial highlights if present
    const highlights = [];
    if (highlightInfo.prevLine && highlightInfo.prevLine > 0) {
      highlights.push({ line: highlightInfo.prevLine, type: "previous" as const });
    }
    if (highlightInfo.nextLine && highlightInfo.nextLine > 0) {
      highlights.push({ line: highlightInfo.nextLine, type: "next" as const });
    }
    if (highlights.length > 0) {
      setHighlight(highlights);
    }
  };

  // Update code in editor if prop changes
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== code) {
      editorRef.current.setValue(code);
    }
  }, [code]);

  // Update highlights when highlightInfo changes
  useEffect(() => {
    if (editorRef.current) {
      const highlights = [];
      if (highlightInfo.prevLine && highlightInfo.prevLine > 0) {
        highlights.push({ line: highlightInfo.prevLine, type: "previous" as const });
      }
      if (highlightInfo.nextLine && highlightInfo.nextLine > 0) {
        highlights.push({ line: highlightInfo.nextLine, type: "next" as const });
      }
      if (highlights.length > 0) {
        setHighlight(highlights);
      } else {
        clearHighlight();
      }
    }
    // eslint-disable-next-line
  }, [highlightInfo.prevLine, highlightInfo.nextLine]);

  /**
   * Set highlights for given lines and types.
   * @param highlights Array of { line, type } objects.
   */
  function setHighlight(
    highlights: { line: number; type: "next" | "previous" }[]
  ) {
    if (!editorRef.current) return;
    const decorations = highlights.map(({ line, type }) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className:
          type === "next"
            ? "highlight-next-step"
            : "highlight-last-executed",
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
        theme="vs-light"
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
