import React from 'react';
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Edge,
  type Node // Added Node type for clarity
} from 'reactflow';
import { Card } from "@/components/ui/card";
// Removed unused Badge and Tooltip imports for now
// import { Badge } from "@/components/ui/badge";
// import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Import custom node components
import FrameNode from './flow/FrameNode';
import HeapObjectNode from './flow/HeapObjectNode';
import PersistentEnvNode from './flow/PersistentEnvNode';

import {
  HeapFunctionObject, // Keep for input prop type for now
  CallStackFrame,     // Keep for input prop type
  DisplayScopeInfo,   // Keep for input prop type
  VariableInfo,       // Keep for input prop type transformation
  Variable,           // New type for node data
  FrameData,          // New type for node data
  HeapObjectData,     // New type for node data
  PersistentEnvData   // New type for node data
} from "../types";

// Define nodeTypes
const nodeTypes = {
  frame: FrameNode,
  heap: HeapObjectNode,
  persistentEnv: PersistentEnvNode,
};

interface VisualizationStateProps {
    callStack: CallStackFrame[];
    scopes: DisplayScopeInfo[];
    heapObjects: Record<string, HeapFunctionObject>;
    persistentEnvironments: DisplayScopeInfo[]; // Changed prop type to DisplayScopeInfo[]
}

export default function VisualizationState({ callStack, scopes, heapObjects, persistentEnvironments = [] }: VisualizationStateProps) {
    const scopeMap = React.useMemo(() => {
        const map = new Map<string | number, DisplayScopeInfo>();
        scopes.forEach(scope => map.set(scope.scopeId, scope));
        // Also map persistent environments for potential variable display if needed later
        persistentEnvironments.forEach(scope => map.set(scope.scopeId, scope));
        return map;
    }, [scopes, persistentEnvironments]); // Added persistentEnvironments dependency

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

React.useEffect(() => {
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    let yPos = 0;
    const frameX = 0;
    const heapX = 400; // Increased spacing
    const persistentEnvX = 0;
    let persistentEnvY = 0; // Will be updated after stack frames

    // Helper to transform VariableInfo to Variable
    const transformVariable = (varInfo: VariableInfo): Variable => {
        if (varInfo.value?.type === 'functionRef') {
            // Assuming functionRef implies a reference to a heap object which is a function
            return { type: 'function', heapId: varInfo.value.id, name: varInfo.varName }; // Or get name from heap obj if available
        }
        // TODO: Add logic for other reference types (object, array) when backend provides them
        // For now, assume everything else is primitive
        return { type: 'primitive', value: varInfo.value };
    };

    // Helper to transform scope variables
    const transformScopeVariables = (scopeId: string): Record<string, Variable> => {
        const scope = scopeMap.get(scopeId);
        const variables: Record<string, Variable> = {};
        if (scope?.variables) {
            scope.variables.forEach(v => {
                variables[v.varName] = transformVariable(v);
            });
        }
        return variables;
    };

    // 1. Create Frame Nodes
    callStack.forEach((frame) => {
        const frameId = `frame-${frame.scopeId}`;
        const frameData: FrameData = {
            name: frame.functionName,
            variables: transformScopeVariables(frame.scopeId)
        };
        newNodes.push({
            id: frameId,
            type: 'frame',
            position: { x: frameX, y: yPos },
            data: frameData,
        });
        // Estimate height roughly for positioning, actual height determined by content
        const estimatedHeight = 60 + Object.keys(frameData.variables).length * 20;
        yPos += estimatedHeight + 20;

        // Add edges for variables pointing to heap
        Object.entries(frameData.variables).forEach(([name, variable]) => {
            if ((variable.type === 'reference' || variable.type === 'function') && heapObjects[variable.heapId]) {
                newEdges.push({
                    id: `edge-${frameId}-${name}-heap-${variable.heapId}`,
                    source: frameId, // Source from the frame node itself
                    target: `heap-${variable.heapId}`,
                    style: { stroke: '#3b82f6', strokeWidth: 1.5 }, // Blue for references
                    type: 'smoothstep',
                });
            }
        });
    });

    persistentEnvY = yPos + 50; // Position below stack

    // 2. Create Persistent Environment Nodes
    persistentEnvironments.forEach((scope, index) => {
        const envId = `env-${scope.scopeId}`;
        const envData: PersistentEnvData = {
            name: scope.name || `Scope ${scope.scopeId}`, // Use scope name
            variables: transformScopeVariables(scope.scopeId)
        };
        newNodes.push({
            id: envId,
            type: 'persistentEnv',
            position: { x: persistentEnvX, y: persistentEnvY + index * 100 }, // Adjust spacing
            data: envData,
        });

        // Add edges for variables pointing to heap
         Object.entries(envData.variables).forEach(([name, variable]) => {
            if ((variable.type === 'reference' || variable.type === 'function') && heapObjects[variable.heapId]) {
                newEdges.push({
                    id: `edge-${envId}-${name}-heap-${variable.heapId}`,
                    source: envId,
                    target: `heap-${variable.heapId}`,
                    style: { stroke: '#3b82f6', strokeWidth: 1.5 },
                    type: 'smoothstep',
                });
            }
        });
    });

    // 3. Create Heap Object Nodes
    Object.values(heapObjects).forEach((obj, index) => {
        const heapNodeId = `heap-${obj.id}`;
        // TODO: Adapt this when backend provides more heap object types and details
        const heapData: HeapObjectData = {
            id: obj.id,
            type: 'function', // Assuming all are functions for now based on HeapFunctionObject
            functionDetails: {
                name: obj.name,
                paramCount: 0, // Placeholder - param count not in HeapFunctionObject
            },
            closureScopeId: obj.definingScopeId || undefined,
            // properties/value would be populated for objects/arrays
        };

        newNodes.push({
            id: heapNodeId,
            type: 'heap',
            position: { x: heapX, y: index * 120 }, // Vertical layout for heap
            data: heapData,
        });

        // Add edge from heap function to its defining environment (closure link)
        if (heapData.closureScopeId) {
            const frameTargetId = `frame-${heapData.closureScopeId}`;
            const envTargetId = `env-${heapData.closureScopeId}`;
            let targetId: string | null = null;

            // Check if the target frame or persistent environment node exists
            if (newNodes.some(node => node.id === frameTargetId)) {
                targetId = frameTargetId;
            } else if (newNodes.some(node => node.id === envTargetId)) {
                targetId = envTargetId;
            }

            if (targetId) {
                newEdges.push({
                    id: `edge-closure-${heapNodeId}-${targetId}`,
                    source: heapNodeId,
                    target: targetId,
                    label: 'closure',
                    type: 'smoothstep',
                    style: { stroke: '#a855f7', strokeDasharray: '5 5', strokeWidth: 1 }, // Purple dashed
                });
            } else {
                 console.warn(`Defining scope node not found for heap object ${obj.id}. Target IDs checked: ${frameTargetId}, ${envTargetId}`);
            }
        }
    });

    setNodes(newNodes);
    setEdges(newEdges);
}, [callStack, scopes, heapObjects, persistentEnvironments, scopeMap]); // Dependencies remain similar


return (
        <Card className="p-4 relative h-[600px] w-full"> {/* Ensure width */}
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes} // Pass the custom node types
            fitView
            attributionPosition="top-right"
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
        >
                <Background />
                <Controls />
            </ReactFlow>
        </Card>
    );
}
