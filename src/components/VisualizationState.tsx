// src/components/VisualizationState.tsx
import React, { useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls as ReactFlowControls, // Renamed to avoid confusion
  useNodesState,
  useEdgesState,
  MarkerType,
  type Edge,
  type Node,
  BackgroundVariant // Import BackgroundVariant
} from 'reactflow';
import 'reactflow/dist/style.css'; // Import React Flow styles

import { Card } from "@/components/ui/card"; // Corrected import path

// Import custom node components
import FrameNode from '@/components/flow/FrameNode'; // Corrected path
import HeapObjectNode from '@/components/flow/HeapObjectNode'; // Corrected path
import PersistentEnvNode from '@/components/flow/PersistentEnvNode'; // Corrected path

import {
  CallStackFrame,
  DisplayScopeInfo,
  VariableInfo,       // For variable structure within DisplayScopeInfo
  Variable,           // For internal node data format (primitive/reference)
  FrameData,
  HeapObjectData,     // Now received as prop value type
  PersistentEnvData
} from "../types"; // Assuming types are updated as needed

// Define nodeTypes mapping custom components
const nodeTypes = {
  frame: FrameNode,
  heap: HeapObjectNode,
  persistentEnv: PersistentEnvNode,
};

interface VisualizationStateProps {
    callStack: CallStackFrame[];
    // All relevant scopes (global, active call frames, persistent envs referenced)
    // Variables within scopes should have 'bindingType'
    scopes: DisplayScopeInfo[];
    // Map of heapId -> structured heap object data
    heapObjects: Record<string, HeapObjectData>;
    // Explicit list of scopes acting as persistent environments
    persistentEnvironments: DisplayScopeInfo[];
}

// Helper to transform DisplayScopeInfo variable (with bindingType) to Node's internal variable format
const transformVariableForNode = (varInfo: VariableInfo): Variable => {
    // Check if the value is a heap reference object sent from backend/storyReducer
    if (varInfo.value && typeof varInfo.value === 'object' && varInfo.value.type === 'reference' && varInfo.value.heapId) {
        // It's a reference to a heap object
        if (varInfo.value.valueType === 'function') {
            // Specific type for function reference
            return { type: 'function', heapId: varInfo.value.heapId };
        } else {
             // Generic reference for objects/arrays
            return { type: 'reference', heapId: varInfo.value.heapId };
        }
    }
    // Otherwise, treat as primitive
    return { type: 'primitive', value: varInfo.value };
};


export default function VisualizationState({
    callStack = [],
    scopes = [],
    heapObjects = {},
    persistentEnvironments = []
}: VisualizationStateProps) {

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Memoize scope map for efficient lookups
    const scopeMap = useMemo(() => {
        const map = new Map<string, DisplayScopeInfo>();
        scopes.forEach(scope => map.set(scope.scopeId, scope));
        return map;
    }, [scopes]);

    useEffect(() => {
        console.log("[VizState] Recalculating nodes/edges. CallStack:", callStack.length, "Scopes:", scopes.length, "Heap:", Object.keys(heapObjects).length, "PersistentEnvs:", persistentEnvironments.length);
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // --- Layout Constants ---
        const frameX = 50;
        const persistentEnvX = 50; // Position below frames
        const heapX = 450; // Position heap to the right
        const yGap = 30; // Vertical gap between elements
        let currentY = 0;

        // --- 1. Create Frame Nodes (Call Stack) ---
        const frameNodeIds = new Set<string>();
        callStack.forEach((frame) => {
            const frameId = `frame-${frame.scopeId}`;
            frameNodeIds.add(frameId);
            const scope = scopeMap.get(frame.scopeId);
            const frameData: FrameData = {
                name: frame.functionName || 'anonymous',
                variables: {}
            };
            if (scope?.variables) {
                scope.variables.forEach(v => {
                    frameData.variables[v.varName] = transformVariableForNode(v);
                });
            }

            newNodes.push({
                id: frameId,
                type: 'frame',
                position: { x: frameX, y: currentY },
                data: frameData,
            });
            // Estimate height roughly for positioning
            const estimatedHeight = 60 + Object.keys(frameData.variables).length * 25;
            currentY += estimatedHeight + yGap;
        });

        // Store Y position for persistent envs
        let persistentEnvY = currentY + yGap * 2; // Add extra gap

        // --- 2. Create Persistent Environment Nodes ---
        const persistentEnvNodeIds = new Set<string>();
        persistentEnvironments.forEach((scope) => {
             // Avoid creating duplicate nodes if a persistent env is also on the call stack (e.g., global)
             if (frameNodeIds.has(`frame-${scope.scopeId}`)) return;

            const envId = `penv-${scope.scopeId}`; // Use 'penv-' prefix
            persistentEnvNodeIds.add(envId);
            const envData: PersistentEnvData = {
                name: scope.name || `Scope ${scope.scopeId}`,
                variables: {}
            };
            if (scope?.variables) {
                scope.variables.forEach(v => {
                    envData.variables[v.varName] = transformVariableForNode(v);
                });
            }

            newNodes.push({
                id: envId,
                type: 'persistentEnv',
                position: { x: persistentEnvX, y: persistentEnvY },
                data: envData,
            });
            const estimatedHeight = 60 + Object.keys(envData.variables).length * 25;
            persistentEnvY += estimatedHeight + yGap;
        });

         // --- 3. Create Heap Object Nodes ---
         currentY = 0; // Reset Y for heap column
         const heapNodeIds = new Set<string>();
         Object.entries(heapObjects).forEach(([heapId, heapData]) => {
             const heapNodeId = `heap-${heapId}`;
             heapNodeIds.add(heapNodeId);

             // Clone data to avoid potential mutation issues if needed elsewhere
             const nodeData: HeapObjectData = { ...heapData };

             newNodes.push({
                 id: heapNodeId,
                 type: 'heap',
                 position: { x: heapX, y: currentY },
                 data: nodeData,
             });
             // Estimate height based on type and content
             let estimatedHeight = 80; // Base height
             if (nodeData.type === 'object' && nodeData.properties) {
                 estimatedHeight += Object.keys(nodeData.properties).length * 25;
             } else if (nodeData.type === 'array' && nodeData.value) {
                 estimatedHeight += nodeData.value.length * 15;
             } else if (nodeData.type === 'function') {
                 estimatedHeight += 20; // For name/params line
                 if (nodeData.closureScopeId) estimatedHeight += 15; // For closure link text
             }
             currentY += estimatedHeight + yGap;
         });


         // --- 4. Create Edges ---

         // Edges from Frames/PersistentEnvs to Heap
         newNodes.forEach(node => {
             if (node.type === 'frame' || node.type === 'persistentEnv') {
                 const sourceId = node.id;
                 const variables = (node.data as FrameData | PersistentEnvData).variables;
                 Object.entries(variables).forEach(([varName, variable]) => {
                     if ((variable.type === 'reference' || variable.type === 'function') && variable.heapId) {
                         const targetId = `heap-${variable.heapId}`;
                         // Ensure target heap node exists
                         if (heapNodeIds.has(targetId)) {
                             newEdges.push({
                                 id: `edge-${sourceId}-${varName}-to-${targetId}`,
                                 source: sourceId,
                                 // TODO: Use sourceHandle specific to variable if VariableDisplay supports it
                                 // sourceHandle: `var-${varName}`,
                                 target: targetId,
                                 type: 'smoothstep', // Or 'default', 'step'
                                 // label: varName, // Label edge with variable name
                                 style: { stroke: '#60a5fa', strokeWidth: 2 }, // Blueish
                                 markerEnd: { type: MarkerType.ArrowClosed, color: '#60a5fa' },
                                 animated: false, // Keep false for clarity unless state change is highlighted
                             });
                         } else {
                              console.warn(`[VizState] Edge Creation: Target heap node ${targetId} not found for variable ${varName} in ${sourceId}.`);
                         }
                     }
                 });
             }
         });

        // Edges from Heap Functions to their Defining Persistent Environment (Closure Links)
         newNodes.forEach(node => {
             if (node.type === 'heap') {
                 const heapData = node.data as HeapObjectData;
                 if (heapData.type === 'function' && heapData.definingScopeId) {
                     const sourceId = node.id; // heap-<id>
                     // IMPORTANT: Target ID must match the PersistentEnvNode ID format
                     const targetId = `penv-${heapData.definingScopeId}`;

                     // Ensure the target persistent environment node exists
                     if (persistentEnvNodeIds.has(targetId)) {
                         newEdges.push({
                             id: `edge-closure-${sourceId}-to-${targetId}`,
                             source: sourceId,
                             target: targetId,
                             type: 'smoothstep',
                             // label: 'closure scope', // Optional label
                             style: { stroke: '#c084fc', strokeDasharray: '5 3', strokeWidth: 1.5 }, // Purple dashed
                             markerEnd: { type: MarkerType.Arrow, color: '#c084fc' }, // Open arrow
                             animated: false,
                         });
                     } else {
                          console.warn(`[VizState] Closure Edge Creation: Target persistent env node ${targetId} not found for heap function ${sourceId}.`);
                          // Possible issue: definingScopeId refers to a scope that *isn't* marked persistent,
                          // or the persistentEnvironments prop wasn't derived correctly in App.tsx.
                          // Check if the defining scope ID exists in the main 'scopes' prop instead:
                          const fallbackTargetId = `frame-${heapData.definingScopeId}`; // Check if it's on the stack
                          if (frameNodeIds.has(fallbackTargetId)) {
                               // Link to the frame on the stack if the defining scope is currently active but not technically "persistent"
                               newEdges.push({
                                   id: `edge-closure-${sourceId}-to-${fallbackTargetId}`,
                                   source: sourceId, target: fallbackTargetId, type: 'smoothstep',
                                   style: { stroke: '#facc15', strokeDasharray: '5 3', strokeWidth: 1.5 }, // Yellow dashed (indicates link to active frame)
                                   markerEnd: { type: MarkerType.Arrow, color: '#facc15' }, animated: false,
                               });
                                console.log(`[VizState] Closure Edge Creation: Linking ${sourceId} to active frame ${fallbackTargetId} as fallback.`);
                          }
                     }
                 }
             }
         });

        console.log("[VizState] Setting", newNodes.length, "nodes and", newEdges.length, "edges.");
        setNodes(newNodes);
        setEdges(newEdges);

    // Dependencies: Trigger recalculation if any relevant part of the state changes
    }, [callStack, scopes, heapObjects, persistentEnvironments, scopeMap]); // Added scopeMap dependency

    return (
        <Card className="p-0 relative h-[600px] w-full overflow-hidden border shadow-sm rounded-lg"> {/* Style card */}
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange} // Handle node movements/deletions
                onEdgesChange={onEdgesChange} // Handle edge changes (less likely needed here)
                nodeTypes={nodeTypes}         // Register custom node components
                fitView                       // Zoom/pan to fit all nodes initially
                attributionPosition="bottom-right"
                nodesDraggable={true}         // Allow users to rearrange nodes
                nodesConnectable={false}      // Disable manual edge creation by user
                elementsSelectable={true}     // Allow selecting nodes/edges
                // proOptions={{ hideAttribution: true }} // Removed - seems incorrect/deprecated
            >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                <ReactFlowControls />
            </ReactFlow>
        </Card>
    );
}
