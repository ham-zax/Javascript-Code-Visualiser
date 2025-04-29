import React from 'react';
import { Handle, Position } from 'reactflow';
import { FrameData } from '../../types'; // Adjust path as needed
import VariableDisplay from './VariableDisplay';

interface FrameNodeProps {
  data: FrameData;
  id: string;
}

const FrameNode: React.FC<FrameNodeProps> = ({ data, id }) => {
  return (
    <div className="react-flow__node-default" style={{ padding: '10px', minWidth: '150px', background: '#fff', border: '1px solid #ddd' }}>
       <Handle type="target" position={Position.Left} style={{ background: '#555' }} />
      <div className="font-bold text-sm mb-1">{data.name || 'Anonymous Function'}</div>
      <VariableDisplay variables={data.variables} scopeId={`frame-${id}`} />
       <Handle type="source" position={Position.Right} style={{ background: '#555' }} />
    </div>
  );
};

export default FrameNode;