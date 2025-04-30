import React from 'react';
import { Variable } from '../../types'; // Assuming types.ts is in src/
import { Badge } from '../ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';

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
 
  // Helper function to get a display string for the variable type
  // Assumes VariableInfo might have a 'type' property, or infers from value
  const getTypeDisplayString = (varInfo: VariableInfo): string => {
    const type = varInfo.type; // Use explicit type if available
    const value = varInfo.value;
 
    if (typeof value === 'object' && value?.type === 'functionRef') return 'function ref';
    if (typeof value === 'object' && value?.type === 'reference') {
       // Use the valueType if provided within the reference object
       return value.valueType ? `${value.valueType} ref` : 'ref';
    }
 
    // Prefer explicit type if present
    if (type) {
        switch (type) {
            case 'number': return 'number';
            case 'string': return 'string';
            case 'boolean': return 'boolean';
            case 'undefined': return 'undefined';
            case 'null': return 'null';
            case 'object': return 'object'; // Could be array or plain object
            case 'array': return 'array';
            case 'function': return 'function'; // For actual function values, not refs yet
            default: return type; // Show unknown types
        }
    }
 
    // Fallback inference if explicit type is missing
    if (value === null) return 'null';
    if (typeof value === 'undefined') return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'function') return 'function'; // Should be caught by functionRef ideally
    if (typeof value === 'object') return 'object'; // Generic object
    return typeof value;
  };
 
  const getTypeVariant = (varInfo: VariableInfo): 'default' | 'secondary' | 'destructive' => {
    const type = varInfo.type;
    const value = varInfo.value;
 
    if (type === 'undefined' || type === 'null' || value === null || typeof value === 'undefined') {
      return 'destructive';
    }
 
    if (typeof value === 'object' && (value?.type === 'functionRef' || value?.type === 'reference')) {
      return 'secondary';
    }
 
    return 'default';
  };
 
  // Function to render the value itself
  const renderValue = (value: any): React.ReactNode => {
    if (typeof value === 'object' && value?.type === 'functionRef') {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-purple-600">ƒ</span>
          </TooltipTrigger>
          <TooltipContent>
            Reference to function {value.heapId}
          </TooltipContent>
        </Tooltip>
      );
    }
    if (typeof value === 'object' && value?.type === 'reference') {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-blue-600">{`{ref: ${value.heapId}}`}</span>
          </TooltipTrigger>
          <TooltipContent>
            Reference to heap object {value.heapId} of type {value.valueType || 'unknown'}
          </TooltipContent>
        </Tooltip>
      );
    }
    if (typeof value === 'string') {
      // Truncate long strings
      const displayString = value.length > 30 ? value.substring(0, 27) + '...' : value;
      return `"${displayString}"`;
    }
    if (value === null) return 'null';
    if (typeof value === 'undefined') return 'undefined';
    // Add more specific rendering if needed (e.g., for arrays)
    return String(value);
  };
 
  return (
    <table className="w-full text-left text-xs border-collapse">
      <tbody>
        {variables.map((variable) => (
          <tr
            key={`${scopeId}-${variable.varName}`}
            className={`border-t border-gray-200${variable.hasChanged ? ' variable-changed' : ''}`}
          >
            {/* Variable Name Column */}
            <td className={`py-0.5 pr-2 font-medium ${getBindingClass(variable.bindingType)}`}>
              {getBindingIcon(variable.bindingType)}
              {variable.varName}:
            </td>
            {/* Value and Type Column */}
            <td className="py-0.5 flex items-center space-x-1">
              <span>{renderValue(variable.value)}</span>
              <Badge
                variant={getTypeVariant(variable)}
                className="text-[0.65rem]"
              >
                {getTypeDisplayString(variable)}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default VariableDisplay;