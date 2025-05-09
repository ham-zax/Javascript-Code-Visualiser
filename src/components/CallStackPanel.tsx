// src/components/CallStackPanel.tsx
import { forwardRef, useState, useImperativeHandle } from 'react';

export interface CallStackPaneHandle {
  // Use functionName consistently
  pushFrame(functionName: string, args: any[], locals: Record<string, any>): void;
  popFrame(): void;
  reset(): void;
  // Keep updateLocals by ID if needed elsewhere, though App.tsx won't use it directly
  updateLocals(frameId: string, locals: Record<string, any>): void;
  // Add method to update the *current* frame's locals
  updateCurrentFrameLocals(locals: Record<string, any>): void;
  getFrames(): Frame[];
}

// Define Frame interface outside for export
export interface Frame { id: string; functionName: string; args: any[]; locals: Record<string, any> }

export const CallStackPanel = forwardRef<CallStackPaneHandle, {}>((_, ref) => {
  // Initialize call stack with a global frame
  const initialFrames: Frame[] = [{ id: 'global', functionName: '(global)', args: [], locals: {} }];
  const [frames, setFrames] = useState<Frame[]>(initialFrames);


  useImperativeHandle(ref, () => ({
    // Use functionName consistently
    pushFrame(functionName, args, locals) {
      setFrames(prev => [...prev, { id: `${functionName}-${prev.length}`, functionName: functionName, args, locals: locals || {} }]);
    },
    popFrame() {
      // Keep the global frame
      setFrames(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
    },
    reset() {
      setFrames(initialFrames);
    },
    updateLocals(frameId, locals) {
      setFrames(prev => prev.map(f => f.id === frameId ? { ...f, locals } : f));
    },
    // Implement updateCurrentFrameLocals
    updateCurrentFrameLocals(locals) {
      setFrames(prev => {
        if (prev.length <= 1) return prev; // Don't update global frame this way
        const updatedFrames = [...prev];
        updatedFrames[updatedFrames.length - 1] = {
          ...updatedFrames[updatedFrames.length - 1],
          locals
        };
        return updatedFrames;
      });
    },
    getFrames() {
      return frames;
    }
  }), [frames]);

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
                {/* Render Args (if any) */}
                {frame.args.length > 0 && (
                  <div className="text-xs text-gray-600 mt-1">Args: {JSON.stringify(frame.args)}</div>
                )}
                {/* Render Locals (if any) */}
                {Object.keys(frame.locals).length > 0 && (
                  <div className="mt-1 pt-1 border-t border-gray-200">
                    <span className="text-xs text-gray-600">Locals:</span>
                    <ul className="text-xs pl-2">
                      {Object.entries(frame.locals).map(([key, value]) => (
                        <li key={key}>
                          <span className="text-gray-500">{key}:</span> {JSON.stringify(value)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
});
