import React, { useEffect, useRef } from 'react'; // Add useEffect, useRef
import { Handle, Position } from 'reactflow';
import { HeapObjectData } from '../../types'; // Adjust path as needed
import VariableDisplay from './VariableDisplay';

interface HeapObjectNodeProps {
  data: HeapObjectData & { isNew?: boolean }; // Add isNew to data type
  id: string;
}

const HeapObjectNode: React.FC<HeapObjectNodeProps> = ({ data, id }) => {
  const nodeRef = useRef<HTMLDivElement>(null); // Create ref

  // Effect to handle entry animation
  useEffect(() => {
    if (data.isNew && nodeRef.current) {
      const element = nodeRef.current;
      element.classList.add('node-enter-active'); // Apply animation class

      // Remove class after animation duration (match CSS)
      const timer = setTimeout(() => {
        element.classList.remove('node-enter-active');
      }, 500); // 500ms matches the planned CSS animation duration

      return () => clearTimeout(timer); // Cleanup timeout on unmount or re-render
    }
  }, [data.isNew]); // Run effect when isNew changes

  const isFunction = data.type === 'function';
  const isArray = data.type === 'array';
  const isObject = data.type === 'object';

  // Tailwind-based color classes
  const bgClass = isFunction
    ? 'bg-sky-50'
    : isArray
    ? 'bg-green-50'
    : 'bg-orange-50';
  const borderClass = isFunction
    ? 'border-sky-400'
    : isArray
    ? 'border-green-500'
    : 'border-orange-500';
  const iconColor = isFunction
    ? 'text-sky-400'
    : isArray
    ? 'text-green-600'
    : 'text-orange-600';

  return (
    <div
      ref={nodeRef} // Assign ref to the main div
      // Keep base styling: background, border, rounded, shadow, min-width, relative
      className={`react-flow__node-default ${bgClass} border-2 ${borderClass} rounded-lg shadow-md min-w-[190px] relative`}
    >
      {/* Handles remain outside the main content flow */}
      <Handle type="target" position={Position.Left} style={{ background: isFunction ? '#0ea5e9' : isArray ? '#22c55e' : '#f97316' }} />
      <Handle type="source" position={Position.Right} style={{ background: isFunction ? '#0ea5e9' : isArray ? '#22c55e' : '#f97316' }} />
 
      {/* --- Metadata Section --- */}
      <div className="px-4 pt-3 pb-2 relative border-b border-gray-300/50">
        {/* Icon remains absolutely positioned within this section */}
        <div className="absolute top-2 right-3">
          {isFunction ? (
            <span title="Function" className={`${iconColor}`} style={{ fontSize: 20 }}>𝑓</span>
          ) : isArray ? (
            <span title="Array" className={`${iconColor}`} style={{ fontSize: 20 }}>⟦⟧</span>
          ) : (
            <span title="Object" className={`${iconColor}`} style={{ fontSize: 20 }}>◩</span>
          )}
        </div>
        {/* Heap ID and Type */}
        <div className="font-bold text-sm pr-7"> {/* Added padding-right to avoid overlap with icon */}
          Heap ID: {data.id} <span className="font-normal text-gray-500">({data.type})</span>
        </div>
      </div>
 
      {/* --- Content Section --- */}
      <div className="px-4 py-2">
        {isFunction && data.functionDetails && (
          <div className="text-xs italic text-sky-800">
            {data.functionDetails.name || 'anonymous'} ({data.functionDetails.paramCount} params)
          </div>
        )}
        {(isObject || isArray) && data.properties && (
          <VariableDisplay
            variables={Object.entries(data.properties).map(([varName, variable]: [string, any]) => ({
              varName,
              // Ensure we handle both direct values and the { type: 'reference', ... } structure
              value: variable.type === 'reference' || variable.type === 'functionRef' ? variable : variable.value,
              bindingType: variable.bindingType,
              type: variable.type // Pass type if available from the property itself
            }))}
            scopeId={`heap-${id}`}
          />
        )}
        {/* Display raw array value if properties aren't the primary source (less common now?) */}
        {isArray && !data.properties && data.value && (
           <div className="text-xs mt-1 text-green-700 overflow-x-auto whitespace-nowrap">
             Elements: [{data.value.map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(', ')}]
           </div>
        )}
      </div>
 
      {/* --- Closure Section (Optional) --- */}
      {isFunction && data.closureScopeId && (
        <div className="px-4 pb-2 pt-1 border-t border-gray-300/50">
          <div className="text-xs text-purple-700">Closure Scope: {data.closureScopeId}</div>
        </div>
      )}
    </div>
  );
};

export default HeapObjectNode;