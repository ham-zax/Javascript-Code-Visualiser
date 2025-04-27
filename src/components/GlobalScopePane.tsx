// src/components/GlobalScopePane.tsx
import React, { forwardRef, useImperativeHandle, useState } from 'react';

export interface GlobalScopePaneHandle {
  setGlobal(name: string, value: any): void;
  reset(): void;
}

export const GlobalScopePane = forwardRef<GlobalScopePaneHandle>((_, ref) => {
  const [globals, setGlobals] = useState<Record<string, any>>({});

  useImperativeHandle(ref, () => ({
    setGlobal(name: string, value: any) {
      setGlobals(prev => ({ ...prev, [name]: value }));
    },
    reset() {
      setGlobals({});
    }
  }), []);

  return (
    <div className="bg-white p-4 rounded-md shadow">
      <h3 className="text-lg font-semibold mb-3 border-b pb-2">Global Scope</h3>
      {Object.keys(globals).length === 0 ? (
        <p className="text-sm text-gray-500 italic">No globals</p>
      ) : (
        <table className="w-full text-left text-sm font-mono">
          <thead>
            <tr><th className="pr-4">Name</th><th>Value</th></tr>
          </thead>
          <tbody>
            {Object.entries(globals).map(([key, val]) => (
              <tr key={key} className="border-t">
                <td className="pr-4 font-medium text-gray-700">{key}</td>
                <td className="text-gray-800">{JSON.stringify(val)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
});
