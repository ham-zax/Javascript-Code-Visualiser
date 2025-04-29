// src/components/VisualizationState.tsx
import { Card } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"; // Keep AccordionContent for Call Stack
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import React from 'react'; // Import React for fragment usage

// Updated types based on task description
export interface CallStackFrame {
    name: string;
    type: string;
    line?: number;
}

export interface VariableInfo {
    varName: string;
    value: any;
    isClosure?: boolean;
    hasChanged?: boolean;
}

export interface DisplayScopeInfo {
    scopeId: string | number;
    parentId: string | number | null;
    type: 'global' | 'function' | 'block' | 'closure' | string; // Allow other types potentially
    name: string;
    variables: VariableInfo[];
    isActive?: boolean;
    isPersistent?: boolean;
    thisBinding?: any; // Keep this if needed
}

// Helper interface for building the tree
interface ScopeNode extends DisplayScopeInfo {
    children: ScopeNode[];
}


interface VisualizationStateProps {
    callStack: CallStackFrame[];
    scopes: DisplayScopeInfo[]; // Changed to array as per task description
}

// Helper function to build the scope tree
const buildScopeTree = (scopes: DisplayScopeInfo[]): ScopeNode[] => {
    // Handle cases where scopes might not be an array initially
    if (!Array.isArray(scopes)) {
        return [];
    }

    const scopeMap: Record<string | number, ScopeNode> = {};
    const rootScopes: ScopeNode[] = [];

    // Initialize map and add children array
    scopes.forEach(scope => {
        scopeMap[scope.scopeId] = { ...scope, children: [] };
    });

    // Build the tree structure
    scopes.forEach(scope => {
        const node = scopeMap[scope.scopeId];
        if (scope.parentId === null || scope.parentId === undefined || !scopeMap[scope.parentId]) {
            // Root scope or parent not found (treat as root)
            rootScopes.push(node);
        } else {
            // Add to parent's children
            scopeMap[scope.parentId].children.push(node);
        }
    });

    return rootScopes;
};

// Recursive component to render scopes
const ScopeRenderer: React.FC<{ scope: ScopeNode }> = ({ scope }) => {
    const scopeClasses = [
        'scope-container',
        `scope-${scope.type.toLowerCase()}`, // Class based on type
        scope.isActive ? 'scope-active' : '',
        scope.isPersistent ? 'scope-persistent' : '',
    ].filter(Boolean).join(' '); // Filter out empty strings and join

    return (
        <div className={scopeClasses}>
            <div className="scope-header font-semibold">
                {scope.name} ({scope.type})
                {scope.isPersistent && <Badge variant="outline" className="ml-2 text-xs">Persistent</Badge>}
            </div>
            <div className="scope-variables pl-4 border-l border-gray-300 ml-2"> {/* Indent variables */}
                {scope.variables.length === 0 && <span className="text-xs text-gray-500 italic">[no variables]</span>}
                {scope.variables.map((variable, index) => {
                    const variableClasses = [
                        'variable-item',
                        variable.isClosure ? 'variable-closure' : '',
                        variable.hasChanged ? 'variable-changed' : '',
                    ].filter(Boolean).join(' ');

                    // Simple value display - might need refinement for complex objects/arrays
                    const displayValue = typeof variable.value === 'object'
                        ? JSON.stringify(variable.value)
                        : String(variable.value);

                    return (
                        <p key={index} className={variableClasses}>
                            <code>{variable.varName}</code>: <span className="variable-value">{displayValue}</span>
                        </p>
                    );
                })}
            </div>
            {/* Render children scopes recursively */}
            {scope.children.length > 0 && (
                <div className="scope-children pl-4 mt-1"> {/* Indent child scopes */}
                    {scope.children.map(childScope => (
                        <ScopeRenderer key={childScope.scopeId} scope={childScope} />
                    ))}
                </div>
            )}
        </div>
    );
};


export default function VisualizationState({ callStack, scopes }: VisualizationStateProps) {
    const scopeTree = buildScopeTree(scopes);

    return (
        <Card className="p-4">
            <Accordion type="multiple" defaultValue={["call-stack", "scopes"]}>
                {/* Call Stack */}
        <AccordionItem value="call-stack">
          <AccordionTrigger>Call Stack</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-2">
              {callStack.length === 0 && (
                <span className="text-gray-400 text-sm">[empty]</span>
              )}
              {callStack.map((frame, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-2 py-1 rounded ${
                    i === callStack.length - 1
                      ? "bg-blue-100 font-bold"
                      : "bg-gray-100"
                  }`}
                >
                  <span>{frame.name}</span>
                  <Badge variant="secondary">{frame.type}</Badge>
                  {typeof frame.line === "number" && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-gray-500 ml-2">Line {frame.line}</span>
                        </TooltipTrigger>
                        <TooltipContent>Line number</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
                {/* Scopes & Memory - Using Nested Structure */}
                <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-2">Scopes & Memory</h3>
                    <div className="flex flex-col gap-2"> {/* Main container for scopes */}
                        {scopeTree.length === 0 && (
                            <span className="text-gray-400 text-sm">[no scopes]</span>
                        )}
                        {scopeTree.map(rootScope => (
                            <ScopeRenderer key={rootScope.scopeId} scope={rootScope} />
                        ))}
                    </div>
                </div>
                {/* End of Scopes & Memory */}
            </Accordion>
        </Card>
    );
}
