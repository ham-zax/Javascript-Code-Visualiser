// src/components/OutputPanel.tsx
    import React from 'react';

    interface OutputPanelProps {
      output: string[];
    }

    export const OutputPanel: React.FC<OutputPanelProps> = ({ output }) => {
      return (
        <div className="bg-gray-800 text-white p-4 rounded-md shadow">
          <h3 className="text-lg font-semibold mb-3 border-b border-gray-600 pb-2">Console Output</h3>
          {output.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No output yet.</p>
          ) : (
            <pre className="text-sm font-mono whitespace-pre-wrap">
              {output.join('\n')}
            </pre>
          )}
        </div>
      );
    };
