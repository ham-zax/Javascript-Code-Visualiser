import React from 'react';
import { Handle, Position } from 'reactflow';
import { PersistentEnvData } from '../../types'; // Adjust path as needed
import VariableDisplay from './VariableDisplay';

interface PersistentEnvNodeProps {
  data: PersistentEnvData;
  id: string;
}

const PersistentEnvNode: React.FC<PersistentEnvNodeProps> = ({ data, id }) => {
  return (
    <div
      className="react-flow__node-default bg-yellow-50 border border-yellow-400 rounded-lg shadow-md px-4 py-3 min-w-[170px] relative flex flex-col gap-1"
    >
      <Handle type="target" position={Position.Left} style={{ background: '#fde047' }} />
      <div className="absolute top-2 right-3" title="Persistent Environment">
        {/* Database/lock icon */}
        <span className="text-yellow-500" style={{ fontSize: 20 }}>🔒</span>
      </div>
      <div className="font-bold text-yellow-700 text-sm mb-1 pr-7">{data.name}</div>
      <VariableDisplay
        variables={Object.entries(data.variables).map(([varName, variable]: [string, any]) => ({
          varName,
          value: variable.value !== undefined ? variable.value : variable,
          bindingType: variable.bindingType,
        }))}
        scopeId={`penv-${id}`}
      />
      <Handle type="source" position={Position.Right} style={{ background: '#fde047' }} />
    </div>
  );
};

export default PersistentEnvNode;