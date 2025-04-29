// src/components/ScopePanel.tsx
    import React from 'react';
import { DisplayScopeInfo } from '../types';

interface ScopePanelProps {
  globalScope: DisplayScopeInfo;
  currentContext?: DisplayScopeInfo;
  capturedScope?: DisplayScopeInfo;
}

const renderScope = (scope: DisplayScopeInfo, title: string, isClosure = false) => (
      <div className={`mb-4 p-3 rounded ${isClosure ? 'bg-purple-100 border border-purple-300' : 'bg-blue-100 border border-blue-300'}`}>
        <h4 className={`font-semibold mb-2 text-sm ${isClosure ? 'text-purple-800' : 'text-blue-800'}`}>{title}</h4>
        {scope.variables.length === 0 ? (
          <p className="text-xs text-gray-500 italic">Empty</p>
        ) : (
          <ul className="list-disc list-inside pl-2 space-y-1">
            {scope.variables.map((variable) => (
              <li key={variable.varName} className="text-xs font-mono">
                <span className="font-medium text-gray-700">{variable.varName}:</span>{' '}
                {/* Improve function display slightly */}
                {variable.type === 'function' ? (
                   <span className="text-purple-700 italic">{JSON.stringify(variable.value)}</span>
                ) : (
                   <span className="text-blue-700">{JSON.stringify(variable.value)}</span>
                )}
                {variable.type && <span className="text-gray-500 text-xs ml-1">({variable.type})</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );

    export const ScopePanel: React.FC<ScopePanelProps> = ({ globalScope, currentContext, capturedScope }) => {
      return (
        <div className="bg-white p-4 rounded-md shadow">
          <h3 className="text-lg font-semibold mb-3 border-b pb-2">Scopes</h3>
          {renderScope(globalScope, 'Global Scope')}
          {currentContext && currentContext.type !== 'global' && (
             renderScope(currentContext, `Local Scope: ${currentContext.name}`)
          )}
           {capturedScope && currentContext && (
             // Simplified title for closure scope
             renderScope(capturedScope, `Closure Scope (for ${currentContext.name})`, true)
          )}
        </div>
      );
    };
