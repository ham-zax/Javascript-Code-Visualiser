import React from 'react';
import { Handle, Position } from 'reactflow';
import { HeapObjectData } from '../../types'; // Adjust path as needed
import VariableDisplay from './VariableDisplay';

interface HeapObjectNodeProps {
  data: HeapObjectData;
  id: string;
}

const HeapObjectNode: React.FC<HeapObjectNodeProps> = ({ data, id }) => {
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
      className={`react-flow__node-default ${bgClass} border-2 ${borderClass} rounded-lg shadow-md px-4 pt-4 pb-3 min-w-[190px] relative flex flex-col gap-1`}
    >
      <Handle type="target" position={Position.Left} style={{ background: isFunction ? '#0ea5e9' : isArray ? '#22c55e' : '#f97316' }} />
      <div className="absolute top-2 right-3">
        {isFunction ? (
          <span title="Function" className={`${iconColor}`} style={{ fontSize: 20 }}>𝑓</span>
        ) : isArray ? (
          <span title="Array" className={`${iconColor}`} style={{ fontSize: 20 }}>⟦⟧</span>
        ) : (
          <span title="Object" className={`${iconColor}`} style={{ fontSize: 20 }}>◩</span>
        )}
      </div>
      <div className="font-bold text-sm mb-1 pr-7">
        Heap ID: {data.id} <span className="font-normal text-gray-500">({data.type})</span>
      </div>
      {isFunction && data.functionDetails && (
        <div className="text-xs mb-1 italic text-sky-800">
          {data.functionDetails.name || 'anonymous'} ({data.functionDetails.paramCount} params)
        </div>
      )}
      {(isObject || isArray) && data.properties && (
        <VariableDisplay
          variables={Object.entries(data.properties).map(([varName, variable]: [string, any]) => ({
            varName,
            value: variable.value !== undefined ? variable.value : variable,
            bindingType: variable.bindingType,
          }))}
          scopeId={`heap-${id}`}
        />
      )}
      {isArray && data.value && (
        <div className="text-xs mt-1 text-green-700">
          [{data.value.map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(', ')}]
        </div>
      )}
      {isFunction && data.closureScopeId && (
        <div className="text-xs mt-1 text-purple-700">Closure Scope: {data.closureScopeId}</div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: isFunction ? '#0ea5e9' : isArray ? '#22c55e' : '#f97316' }} />
    </div>
  );
};

export default HeapObjectNode;