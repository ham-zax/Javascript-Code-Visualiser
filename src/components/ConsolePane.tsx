// src/components/ConsolePane.tsx
import { forwardRef, useImperativeHandle, useState } from 'react';

export interface ConsolePaneHandle {
  append(text: string): void;
  reset(): void;
}

export const ConsolePane = forwardRef<ConsolePaneHandle, {}>((_, ref) => {
  const [lines, setLines] = useState<string[]>([]);

  useImperativeHandle(ref, () => ({
    append(text: string) {
      setLines(prev => [...prev, text]);
    },
    reset() {
      setLines([]);
    },
  }), []);

  return (
    <div className="bg-gray-800 text-white p-4 rounded-md shadow">
      <h3 className="text-lg font-semibold mb-3 border-b border-gray-600 pb-2">Console Output</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No output yet.</p>
      ) : (
        <pre className="text-sm font-mono whitespace-pre-wrap">{lines.join('\n')}</pre>
      )}
    </div>
  );
});