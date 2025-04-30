import React, { useEffect, useRef } from 'react'; // Add useEffect, useRef
import { Handle, Position } from 'reactflow';
import { FrameData } from '../../types'; // Adjust path as needed
import VariableDisplay from './VariableDisplay';

interface FrameNodeProps {
  data: FrameData & { isActive?: boolean; isNew?: boolean }; // Add isNew to data type
  id: string;
}

const FrameNode: React.FC<FrameNodeProps> = ({ data, id }) => {
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

  return (
    <div
      ref={nodeRef} // Assign ref to the main div
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