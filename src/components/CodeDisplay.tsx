// src/components/CodeDisplay.tsx
import React, { forwardRef } from 'react';

interface CodeDisplayProps {
  codeLines: string[];
  highlightedLines: number[]; // 1-based line numbers
  activeLineRef?: React.Ref<HTMLDivElement>;
}

export const CodeDisplay = forwardRef<HTMLDivElement, CodeDisplayProps>(
  ({ codeLines, highlightedLines, activeLineRef }, ref) => {
    return (
      <div ref={ref} className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm overflow-x-auto">
        <pre>
          {codeLines.map((line, index) => {
            const lineNo = index + 1;
            const isActive = highlightedLines.includes(lineNo);
            return (
              <div
                key={index}
                ref={isActive ? activeLineRef : undefined}
                className={`flex items-start ${isActive ? 'bg-yellow-700 bg-opacity-60' : ''}`}
              >
                {/* Gutter arrow */}
                <div className="w-4 text-right pr-1 select-none">
                  {isActive ? '►' : ''}
                </div>
                {/* Line numbers */}
                <div className="w-8 text-gray-500 select-none text-right pr-2">
                  {String(lineNo).padStart(2, ' ')}
                </div>
                {/* Code text */}
                <div className="whitespace-pre font-mono">{line}</div>
              </div>
            );
          })}
        </pre>
      </div>
    );
  }
);
