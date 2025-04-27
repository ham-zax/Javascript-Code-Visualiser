// src/components/CallStackPanel.tsx
import { forwardRef, useState, useImperativeHandle } from 'react';

export interface CallStackPaneHandle {
  pushFrame(funcName: string, args: any[]): void;
  popFrame(): void;
  reset(): void;
  updateLocals(frameId: string, locals: Record<string, any>): void;
}

export const CallStackPanel = forwardRef<CallStackPaneHandle, {}>((_, ref) => {
  interface Frame { id: string; functionName: string; args: any[]; locals: Record<string, any> }
  const [frames, setFrames] = useState<Frame[]>([]);

  useImperativeHandle(ref, () => ({
    pushFrame(funcName, args) {
      setFrames(prev => [...prev, { id: `${funcName}-${prev.length}`, functionName: funcName, args, locals: {} }]);
    },
    popFrame() {
      setFrames(prev => prev.slice(0, -1));
    },
    reset() {
      setFrames([]);
    },
    updateLocals(frameId, locals) {
      setFrames(prev => prev.map(f => f.id === frameId ? { ...f, locals } : f));
    }
  }), []);

  return (
    <div className="bg-white p-4 rounded-md shadow">
      <h3 className="text-lg font-semibold mb-3 border-b pb-2">Call Stack</h3>
      {frames.length === 0
        ? <p className="text-sm text-gray-500 italic">Empty</p>
        : (
          <ul className="space-y-2">
            {[...frames].reverse().map((frame) => (
              <li
                key={frame.id}
                className="p-2 rounded text-sm font-mono bg-gray-100 border border-gray-300"
              >
                <div className="font-medium">{frame.functionName}</div>
                {frame.args.length > 0 && (
                  <div className="text-xs text-gray-600">Args: {JSON.stringify(frame.args)}</div>
                )}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
});
