// src/components/ScopePanel.tsx
    import React from 'react';
    import { Scope, ExecutionContext } from '../simulationSteps';

    interface ScopePanelProps {
      globalScope: Scope;
      currentContext: ExecutionContext | undefined;
      capturedScope: Scope | null; // The scope captured by closure
      closureSourceContextName: string; // Name of the context where closure was formed
    }

    const renderScope = (scope: Scope, title: string, isClosure = false) => (
      <div className={`mb-4 p-3 rounded ${isClosure ? 'bg-purple-100 border border-purple-300' : 'bg-blue-100 border border-blue-300'}`}>
        <h4 className={`font-semibold mb-2 text-sm ${isClosure ? 'text-purple-800' : 'text-blue-800'}`}>{title}</h4>
        {Object.entries(scope).length === 0 ? (
          <p className="text-xs text-gray-500 italic">Empty</p>
        ) : (
          <ul className="list-disc list-inside pl-2 space-y-1">
            {Object.entries(scope).map(([key, { value, type }]) => (
              <li key={key} className="text-xs font-mono">
                <span className="font-medium text-gray-700">{key}:</span>{' '}
                {/* Improve function display slightly */}
                {type === 'function' ? (
                   <span className="text-purple-700 italic">{JSON.stringify(value)}</span>
                ) : (
                   <span className="text-blue-700">{JSON.stringify(value)}</span>
                )}
                {type && <span className="text-gray-500 text-xs ml-1">({type})</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );

    export const ScopePanel: React.FC<ScopePanelProps> = ({ globalScope, currentContext, capturedScope, closureSourceContextName }) => {
      return (
        <div className="bg-white p-4 rounded-md shadow">
          <h3 className="text-lg font-semibold mb-3 border-b pb-2">Scopes</h3>
          {renderScope(globalScope, 'Global Scope')}
          {currentContext && currentContext.functionName !== '(global)' && (
             renderScope(currentContext.localScope, `Local Scope: ${currentContext.functionName}`)
          )}
           {capturedScope && currentContext && (
             // Refined title for closure scope
             renderScope(capturedScope, `Closure Scope (for ${currentContext.functionName}, from ${closureSourceContextName})`, true)
          )}
        </div>
      );
    };
