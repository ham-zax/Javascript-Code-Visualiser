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
    <div className="react-flow__node-default" style={{ padding: '10px', minWidth: '150px', background: '#fefce8', border: '1px solid #fde047' }}>
       <Handle type="target" position={Position.Left} style={{ background: '#555' }} />
      <div className="font-bold text-sm mb-1">{data.name}</div>
      <VariableDisplay variables={data.variables} scopeId={`penv-${id}`} />
       <Handle type="source" position={Position.Right} style={{ background: '#555' }} />
    </div>
  );
};

export default PersistentEnvNode;