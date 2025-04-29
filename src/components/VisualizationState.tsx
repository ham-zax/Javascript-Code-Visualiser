import React from 'react';
import ReactFlow, { 
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Edge
} from 'reactflow';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


import { 
  HeapFunctionObject,
  CallStackFrame,
  DisplayScopeInfo,
  VariableInfo
} from "../types";

interface VisualizationStateProps {
    callStack: CallStackFrame[];
    scopes: DisplayScopeInfo[];
    heapObjects: Record<string, HeapFunctionObject>;
    persistentEnvironments?: DisplayScopeInfo[];
}

export default function VisualizationState({ callStack, scopes, heapObjects, persistentEnvironments = [] }: VisualizationStateProps) {
    const scopeMap = React.useMemo(() => {
        const map = new Map<string | number, DisplayScopeInfo>();
        scopes.forEach(scope => map.set(scope.scopeId, scope));
        return map;
    }, [scopes]);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    React.useEffect(() => {
        const newNodes: any[] = [];
        const newEdges: Edge[] = [];
        let yPos = 0;

        // Create frame nodes
        callStack.forEach((frame, i) => {
            const frameId = `frame-${frame.scopeId}`;
            newNodes.push({
                id: frameId,
                position: { x: 0, y: yPos },
                data: {
                    label: (
                        <div className={`p-2 rounded border ${i === callStack.length - 1 ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <span className={`font-medium ${i === callStack.length - 1 ? 'text-blue-700' : 'text-gray-700'}`}>
                                    {frame.functionName}
                                </span>
                                <Badge variant="secondary" className="text-xs">{frame.type}</Badge>
                            </div>
                        </div>
                    )
                },
                type: 'frame',
                width: 300,
                height: 100
            });
            yPos += 120;

            // Create variable nodes
            const scope = scopeMap.get(frame.scopeId);
            if (scope) {
                scope.variables.forEach((variable, varIndex) => {
                    const varId = `var-${frame.scopeId}-${variable.varName}`;
                    newNodes.push({
                        id: varId,
                        position: { x: 20, y: yPos + varIndex * 40 },
                        data: {
                            label: (
                                <p className="text-sm">
                                    <code>{variable.varName}</code>: {JSON.stringify(variable.value)}
                                </p>
                            )
                        },
                        parentId: frameId,
                        extent: 'parent',
                        width: 260,
                        height: 30
                    });

                    // Create edges to heap objects
                    if (variable.value?.type === 'functionRef' && heapObjects[variable.value.id]) {
                        newEdges.push({
                            id: `${varId}-heap-${variable.value.id}`,
                            source: varId,
                            target: `heap-${variable.value.id}`,
                            animated: true,
                            style: { stroke: '#9333ea' }
                        });
                    }
                });
                yPos += scope.variables.length * 40 + 20;
            }
        });

        // Create heap object nodes
        Object.values(heapObjects).forEach((obj, index) => {
            newNodes.push({
                id: `heap-${obj.id}`,
                position: { x: 400, y: index * 200 },
                data: {
                    label: (
                        <div className="p-2 rounded border border-purple-300 bg-purple-50 text-sm">
                            <div className="font-medium text-purple-700">Function: {obj.name}</div>
                            <div className="text-xs text-gray-500">ID: {obj.id}</div>
                        </div>
                    )
                },
                width: 300,
                height: 100
            });

            // Create edges to defining scope
            if (obj.definingScopeId) {
                newEdges.push({
                    id: `heap-${obj.id}-def`,
                    source: `heap-${obj.id}`,
                    target: `frame-${obj.definingScopeId}`,
                    label: 'defined in',
                    style: { stroke: '#8884d8' }
                });
            }
        });

        setNodes(newNodes);
        setEdges(newEdges);
    }, [callStack, scopes, heapObjects]);


    return (
        <Card className="p-4 relative h-[600px]">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                attributionPosition="top-right"
            >
                <Background />
                <Controls />
            </ReactFlow>
        </Card>
    );
}
