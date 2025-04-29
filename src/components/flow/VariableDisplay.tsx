import React from 'react';
import { Variable } from '../../types'; // Assuming types.ts is in src/

interface VariableDisplayProps {
  variables: Record<string, Variable>;
  scopeId: string; // Unique identifier for the scope (frame, object, etc.)
}

const VariableDisplay: React.FC<VariableDisplayProps> = ({ variables, scopeId }) => {
  if (!variables || Object.keys(variables).length === 0) {
    return <div className="text-xs text-gray-500 italic">No variables</div>;
  }

  return (
    <table className="w-full text-left text-xs border-collapse">
      <tbody>
        {Object.entries(variables).map(([name, variable]) => (
          <tr key={`${scopeId}-${name}`} className="border-t border-gray-200">
            <td className="py-0.5 pr-2 font-medium">{name}:</td>
            <td className="py-0.5">
              {variable.type === 'primitive' ? (
                 typeof variable.value === 'string' ? `"${variable.value}"` : String(variable.value)
              ) : variable.type === 'reference' ? (
                <span className="text-blue-600 cursor-pointer" title={`Points to heap object ${variable.heapId}`}>
                  &rarr; Heap[{variable.heapId}]
                </span>
              ) : variable.type === 'function' ? (
                 <span className="text-purple-600" title={`Function ${variable.name || 'anonymous'}`}>ƒ</span>
              ) : (
                <span className="text-red-500 italic">Unknown</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default VariableDisplay;