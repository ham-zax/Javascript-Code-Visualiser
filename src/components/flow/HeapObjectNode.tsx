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

  return (
    <div className="react-flow__node-default" style={{ padding: '10px', minWidth: '180px', background: isFunction ? '#f0f9ff' : isArray ? '#f0fff4' : '#fff7ed', border: `1px solid ${isFunction ? '#bae6fd' : isArray ? '#bbf7d0' : '#fed7aa'}` }}>
       <Handle type="target" position={Position.Left} style={{ background: '#555' }} />
      <div className="font-bold text-sm mb-1">
        Heap ID: {data.id} ({data.type})
      </div>
      {isFunction && data.functionDetails && (
        <div className="text-xs mb-1 italic">
          {data.functionDetails.name || 'anonymous'} ({data.functionDetails.paramCount} params)
        </div>
      )}
      {(isObject || isArray) && data.properties && (
         <VariableDisplay variables={data.properties} scopeId={`heap-${id}`} />
      )}
       {isArray && data.value && ( // Display array elements if simple
         <div className="text-xs mt-1">[{data.value.map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(', ')}]</div>
       )}
       {isFunction && data.closureScopeId && (
         <div className="text-xs mt-1 text-purple-700">Closure Scope: {data.closureScopeId}</div>
       )}
       <Handle type="source" position={Position.Right} style={{ background: '#555' }} />
    </div>
  );
};

export default HeapObjectNode;