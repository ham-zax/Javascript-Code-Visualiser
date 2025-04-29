import React from 'react';
import { Variable } from '../../types'; // Assuming types.ts is in src/

import { VariableInfo } from '../../types';

interface VariableDisplayProps {
  variables: VariableInfo[];
  scopeId: string; // Unique identifier for the scope (frame, object, etc.)
}

const VariableDisplay: React.FC<VariableDisplayProps> = ({ variables, scopeId }) => {
  if (!variables || variables.length === 0) {
    return <div className="text-xs text-gray-500 italic">No variables</div>;
  }

  // Helper for icon based on bindingType
  const getBindingIcon = (bindingType?: string) => {
    if (bindingType === "closure") return <span title="Closure variable" className="mr-1">🔒</span>;
    if (bindingType === "global") return <span title="Global variable" className="mr-1">🌐</span>;
    return null;
  };

  // Helper for className based on bindingType
  const getBindingClass = (bindingType?: string) => {
    if (bindingType === "closure") return "text-purple-700 italic";
    if (bindingType === "global") return "text-blue-700 font-bold";
    return "";
  };

  return (
    <table className="w-full text-left text-xs border-collapse">
      <tbody>
        {variables.map((variable) => (
          <tr key={`${scopeId}-${variable.varName}`} className="border-t border-gray-200">
            <td className={`py-0.5 pr-2 font-medium ${getBindingClass(variable.bindingType)}`}>
              {getBindingIcon(variable.bindingType)}
              {variable.varName}:
            </td>
            <td className="py-0.5">
              {typeof variable.value === 'object' && variable.value?.type === 'functionRef'
                ? <span className="text-purple-600" title={`Function ref ${variable.value.id}`}>ƒ</span>
                : typeof variable.value === 'string'
                  ? `"${variable.value}"`
                  : String(variable.value)
              }
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default VariableDisplay;