// src/components/CodeViewer.tsx
import { forwardRef, useImperativeHandle, useRef, useEffect, useState, ForwardedRef, useCallback } from 'react'; // Add ForwardedRef, useCallback
import * as monaco from 'monaco-editor';
import Editor, { OnMount } from '@monaco-editor/react';
import { motion, AnimatePresence } from 'framer-motion'; // Import Framer Motion
import { usePlaybackStore, TraceEvent } from '../store/playbackStore'; // Import store and types
import { Frame } from './CallStackPanel'; // Import Frame interface

// Define the structure for a highlight
export type HighlightType = 'current' | 'return' | 'call';
export interface Highlight {
  line: number;
  type: HighlightType;
}

// Interface for console log bubbles
interface ConsoleBubble {
  id: string;
  line: number;
  message: string;
  timeoutId: NodeJS.Timeout;
}

export interface CodeViewerHandle {
  setHighlights(highlights: Highlight[]): void;
  reset(): void;
}

export interface CodeViewerProps {
  code: string;
  globals: Record<string, any>;
  frames: Frame[];
  // highlights prop is removed as it's now derived from the store's events
}

export const CodeViewer = forwardRef<CodeViewerHandle, CodeViewerProps>(({ code, globals, frames }, ref: ForwardedRef<CodeViewerHandle>) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const hoverProviderRef = useRef<monaco.IDisposable | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const [consoleBubbles, setConsoleBubbles] = useState<ConsoleBubble[]>([]);
  const [currentLineForArrow, setCurrentLineForArrow] = useState<number | null>(null);
  const [highlightPositions, setHighlightPositions] = useState<{ line: number; top: number; type: HighlightType }[]>([]);

  // Get state from Zustand store
  const events = usePlaybackStore((state) => state.events);
  const idx = usePlaybackStore((state) => state.idx);

  // --- Helper Functions ---

  const getLineTop = (line: number): number => {
    if (!editorRef.current) return 0;
    // Adjust for editor's scroll position to get position relative to viewport
    return editorRef.current.getTopForLineNumber(line) - editorRef.current.getScrollTop();
  };

  const formatConsoleMessage = (args: any[]): string => {
    return args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
  };

  // Function to find variable value in current scope (existing function)
  const findValueInScope = (identifier: string): any => {
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i].locals && identifier in frames[i].locals) {
        return frames[i].locals[identifier];
      }
    }
    if (globals && identifier in globals) {
      return globals[identifier];
    }
    return undefined;
  };

  // Helper to get the highlights currently meant to be shown based on the event index (Memoized)
  const getHighlightsFromState = useCallback((): Highlight[] => {
    if (idx < 0 || idx >= events.length) return [];
    const currentEvent = events[idx];
    let currentHighlights: Highlight[] = [];
    if (currentEvent.type === 'line') {
      currentHighlights.push({ line: currentEvent.payload.line, type: 'current' });
    } else if (currentEvent.type === 'call') {
      currentHighlights.push({ line: currentEvent.payload.line, type: 'call' });
    } else if (currentEvent.type === 'return') {
      currentHighlights.push({ line: currentEvent.payload.line, type: 'return' });
    } else if (currentEvent.type === 'console') {
      // Highlight the line *before* the console log for context
      let prevLineEventIdx = idx - 1;
      while (prevLineEventIdx >= 0 && events[prevLineEventIdx].type !== 'line') {
        prevLineEventIdx--;
      }
      if (prevLineEventIdx >= 0) {
        currentHighlights.push({ line: events[prevLineEventIdx].payload.line, type: 'current' });
      }
    }
    return currentHighlights;
  }, [idx, events]); // Dependencies for useCallback

  // Update animated positions based on current highlights and editor state (Memoized)
  const updateHighlightAndArrowPositions = useCallback(() => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    const currentHighlights = getHighlightsFromState(); // Uses memoized version

    const newPositions = currentHighlights
      .map(h => ({
        line: h.line,
        top: getLineTop(h.line), // Calculate position relative to viewport
        type: h.type,
      }))
      .filter(p => p.top >= 0 && p.top <= editor.getLayoutInfo().height); // Only include visible lines

    setHighlightPositions(newPositions);

    const currentLineHighlight = currentHighlights.find(h => h.type === 'current');
    setCurrentLineForArrow(currentLineHighlight ? currentLineHighlight.line : null);
  }, [getHighlightsFromState, setHighlightPositions, setCurrentLineForArrow]); // Dependencies for useCallback


  // --- Editor Setup (onMount) ---
  const onMount: OnMount = (editor) => {
    editorRef.current = editor;

    // Listen to scroll events to update positions
    editor.onDidScrollChange(() => {
      updateHighlightAndArrowPositions(); // Recalculate on scroll
    });

    // Initial position update
    updateHighlightAndArrowPositions();

    // Dispose previous hover provider if exists
    if (hoverProviderRef.current) {
      hoverProviderRef.current.dispose();
    }

    // Register hover provider (existing logic)
    hoverProviderRef.current = monaco.languages.registerHoverProvider('javascript', {
      provideHover: (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return;
        const identifier = word.word;
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const value = findValueInScope(identifier);
        const lineContent = model.getLineContent(position.lineNumber);
        const charAfterWord = lineContent.charAt(word.endColumn - 1);

        if (charAfterWord === '(' && typeof value === 'function') {
          return {
            range: range,
            contents: [{ value: `**(function) ${identifier}**` }]
          };
        } else if (value !== undefined) {
          return {
            range: range,
            contents: [{ value: `**${identifier}**: \`${JSON.stringify(value)}\`` }]
          };
        }
        return;
      }
    });
  };

  // --- Imperative Handle ---
  // Exposes methods callable via the ref
  useImperativeHandle(ref, () => ({
    // Sets Monaco's internal decorations (used by useEffect below)
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
      // Trigger animated position update after Monaco decorations are set
      updateHighlightAndArrowPositions();
    },
    // Resets all highlights, decorations, and bubbles
    reset() {
      const editor = editorRef.current;
      if (editor) {
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
      }
      setHighlightPositions([]);
      setCurrentLineForArrow(null);
      setConsoleBubbles(prev => {
        prev.forEach(b => clearTimeout(b.timeoutId));
        return [];
      });
    }
  }), [updateHighlightAndArrowPositions]); // Use memoized updateHighlightAndArrowPositions

  // --- Effects ---

  // Update editor value if code prop changes
  useEffect(() => {
    // Check if ref is an object and current is set
    const handle = (ref && typeof ref === 'object' && ref.current) ? ref.current : null;
    if (editorRef.current && editorRef.current.getValue() !== code) {
      editorRef.current.setValue(code);
      if (handle) {
        handle.reset(); // Reset everything when code changes
      }
    }
  }, [code, ref]);

  // Process events from store to update highlights, arrow, and bubbles
  useEffect(() => {
    // Check if ref is an object and current is set
    const handle = (ref && typeof ref === 'object' && ref.current) ? ref.current : null;

    if (!editorRef.current || !handle) {
      // If editor or handle isn't ready, do nothing or reset
      if (idx === -1 && handle) { // Check handle exists before calling reset
        handle.reset();
      }
      return;
    }

    if (idx < 0 || idx >= events.length) {
      // Handle invalid index, potentially reset
      if (idx === -1) {
        handle.reset(); // handle is guaranteed to exist here
      }
      return;
    }

    const currentEvent = events[idx];
    const newHighlights = getHighlightsFromState(); // Calculate highlights based on current event

    // Update Monaco decorations via the imperative handle
    handle.setHighlights(newHighlights);

    // Handle Console Bubbles specifically for 'console' events
    if (currentEvent.type === 'console' && currentEvent.payload?.line) {
      const line = currentEvent.payload.line;
      const message = formatConsoleMessage(currentEvent.payload.args || []);
      const id = `bubble-${line}-${Date.now()}`;

      const timeoutId = setTimeout(() => {
        setConsoleBubbles(prev => prev.filter(b => b.id !== id));
      }, 2000); // Auto-remove after 2 seconds

      setConsoleBubbles(prev => [...prev, { id, line, message, timeoutId }]);
    }

    // Note: updateHighlightAndArrowPositions is called inside handle.setHighlights

  }, [idx, events, code, ref, getHighlightsFromState, updateHighlightAndArrowPositions, setConsoleBubbles]); // Use memoized functions, add missing state setters

  // Effect to clean up hover provider and bubble timeouts on unmount
  useEffect(() => {
    // Store the current ref value
    const currentHoverProvider = hoverProviderRef.current;
    return () => {
      currentHoverProvider?.dispose();
      // Clear any pending timeouts when component unmounts
      consoleBubbles.forEach(b => clearTimeout(b.timeoutId));
    };
  }, [consoleBubbles]); // Rerun cleanup if bubbles change (though unlikely needed)


  // --- Render ---
  const editorHeight = "400px";
  // Calculate gutter width dynamically or use a reasonable default
  const gutterWidth = editorRef.current?.getLayoutInfo().glyphMarginWidth ?? 35; // Adjusted default

  return (
    <div style={{ position: 'relative', height: editorHeight, overflow: 'hidden' }}> {/* Added overflow hidden */}
      <Editor
        height={editorHeight}
        defaultLanguage="javascript"
        theme="vs-dark"
        value={code}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          glyphMargin: true, // Ensure glyph margin is enabled for positioning
          lineNumbersMinChars: 3 // Ensure enough space for line numbers
        }}
        onMount={onMount}
      />

      {/* Animated Gutter Arrow */}
      {currentLineForArrow !== null && (
        <motion.div
          key={`arrow-${currentLineForArrow}`}
          style={{
            position: 'absolute',
            // Position within the glyph margin, adjust offset as needed
            left: `${gutterWidth - 25}px`, // Example positioning
            top: 0, // Controlled by 'y' animation
            width: '10px',
            height: '10px',
            borderRight: '2px solid cyan',
            borderBottom: '2px solid cyan',
            transform: 'rotate(-45deg)',
            pointerEvents: 'none',
            zIndex: 5, // Ensure it's visible
          }}
          initial={{ y: getLineTop(currentLineForArrow) + 5, opacity: 0 }}
          animate={{
            y: getLineTop(currentLineForArrow) + 5, // Target line's top position + offset
            opacity: 1,
            transition: { type: 'spring', stiffness: 300, damping: 25 }
          }}
          exit={{ opacity: 0 }}
        />
      )}

      {/* Animated Line Highlights */}
      <AnimatePresence>
        {highlightPositions.map(({ line, top, type }) => (
          <motion.div
            key={`highlight-${line}-${type}`}
            style={{
              position: 'absolute',
              left: `${gutterWidth}px`, // Start after the gutter/glyph margin
              right: '0px', // Span editor width (consider scrollbar width if needed)
              top: `${top}px`, // Position based on calculated top
              height: `${editorRef.current?.getOption(monaco.editor.EditorOption.lineHeight)}px`,
              backgroundColor: type === 'current' ? 'rgba(0, 255, 255, 0.15)' :
                type === 'call' ? 'rgba(255, 255, 0, 0.15)' :
                  type === 'return' ? 'rgba(0, 255, 0, 0.15)' :
                    'transparent',
              pointerEvents: 'none',
              zIndex: 0, // Behind text
            }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }} // Faster transition
          />
        ))}
      </AnimatePresence>

      {/* Console Bubbles */}
      <AnimatePresence>
        {consoleBubbles.map(({ id, line, message }) => (
          <motion.div
            key={id}
            style={{
              position: 'absolute',
              left: `${gutterWidth + 5}px`, // Position next to gutter
              top: `${getLineTop(line)}px`, // Align with line number's top
              background: 'rgba(50, 50, 50, 0.9)', // Slightly more opaque
              color: 'white',
              padding: '3px 8px', // Slightly larger padding
              borderRadius: '4px',
              fontSize: '11px', // Smaller font size
              maxWidth: '250px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 10, // Above highlights and arrow
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)', // Add subtle shadow
            }}
            initial={{ opacity: 0, y: -10, scale: 0.9 }} // Add scale effect
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.9, transition: { duration: 0.3 } }} // Fade out downwards
            transition={{ type: 'spring', stiffness: 400, damping: 30 }} // Spring animation
          >
            {message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});

// Add display name for better debugging
CodeViewer.displayName = 'CodeViewer';
