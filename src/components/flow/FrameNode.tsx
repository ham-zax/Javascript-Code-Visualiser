import React from 'react';
import { Handle, Position } from 'reactflow';
import { FrameData } from '../../types'; // Adjust path as needed
import VariableDisplay from './VariableDisplay';

interface FrameNodeProps {
  data: FrameData & { isActive?: boolean };
  id: string;
}

const FrameNode: React.FC<FrameNodeProps> = ({ data, id }) => {
  return (
    <div
      className={`react-flow__node-default bg-white border border-sky-300 rounded-lg shadow-md px-4 py-3 min-w-[170px] relative flex flex-col gap-1${data.isActive ? ' frame-node-active' : ''}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#0ea5e9' }} />
      <div className="absolute top-2 right-3" title="Frame">
        {/* Stack/Frame icon */}
        <span className="text-sky-400" style={{ fontSize: 20 }}>🗂️</span>
      </div>
      <div className="font-bold text-sky-700 text-sm mb-1 pr-7">
        {data.name || 'Anonymous Function'}
      </div>
      <VariableDisplay
        variables={Object.entries(data.variables).map(([varName, variable]: [string, any]) => ({
          varName,
          value: variable.value !== undefined ? variable.value : variable,
          bindingType: variable.bindingType,
        }))}
        scopeId={`frame-${id}`}
      />
      <Handle type="source" position={Position.Right} style={{ background: '#0ea5e9' }} />
    </div>
  );
};

export default FrameNode;