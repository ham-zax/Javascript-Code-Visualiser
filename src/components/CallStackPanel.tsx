// src/components/CallStackPanel.tsx
import React, { forwardRef } from 'react';
import { ExecutionContext } from '../simulationSteps';

interface CallStackPanelProps {
  callStack: ExecutionContext[];
  topFrameRef?: React.Ref<HTMLLIElement>;
}

export const CallStackPanel = forwardRef<HTMLDivElement, CallStackPanelProps>(
  ({ callStack, topFrameRef }, ref) => {
    return (
      <div ref={ref} className="bg-white p-4 rounded-md shadow">
        <h3 className="text-lg font-semibold mb-3 border-b pb-2">Call Stack</h3>
        {callStack.length === 0 ? (
          <p className="text-sm text-gray-500 italic">Empty</p>
        ) : (
          <ul className="space-y-2">
            {[...callStack].reverse().map((context, index) => (
              <li
                key={context.id + '-' + index}
                ref={index === 0 ? topFrameRef : undefined}
                className={`p-2 rounded text-sm font-mono ${index === 0 ? 'bg-green-100 border border-green-300' : 'bg-gray-100 border border-gray-300'}`}
              >
                {context.functionName}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);
