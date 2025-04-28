// src/components/VisualizationState.tsx
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface CallStackFrame {
  name: string;
  type: string;
  line?: number;
}

export interface ScopeInfo {
  name: string;
  type: string;
  isPersistent?: boolean;
  variables: {
    varName: string;
    value: any;
    isClosure?: boolean;
    hasChanged?: boolean;
  }[];
  thisBinding?: any;
}

interface VisualizationStateProps {
  callStack: CallStackFrame[];
  scopes: Record<string, ScopeInfo>;
}

export default function VisualizationState({ callStack, scopes }: VisualizationStateProps) {
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
        {/* Scopes & Memory */}
        <AccordionItem value="scopes">
          <AccordionTrigger>Scopes & Memory</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4">
              {Object.values(scopes).length === 0 && (
                <span className="text-gray-400 text-sm">[no scopes]</span>
              )}
              {Object.values(scopes).map((scope, i) => (
                <div key={i} className="border rounded p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{scope.name}</span>
                    <Badge variant="outline">{scope.type}</Badge>
                    {scope.isPersistent && (
                      <Badge variant="secondary">Persistent</Badge>
                    )}
                  </div>
                  <div className="ml-4">
                    {scope.variables.map((variable, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <span
                          className={`font-mono ${
                            variable.hasChanged ? "text-green-600 font-bold" : ""
                          }`}
                        >
                          {variable.varName}
                        </span>
                        <span className="text-xs text-gray-500">
                          {typeof variable.value === "function"
                            ? "[Function]"
                            : JSON.stringify(variable.value)}
                        </span>
                        {variable.isClosure && (
                          <Badge variant="secondary">closure</Badge>
                        )}
                      </div>
                    ))}
                    {scope.thisBinding !== undefined && (
                      <div className="text-xs text-gray-500 mt-1">
                        <span className="font-mono">this</span>:{" "}
                        {JSON.stringify(scope.thisBinding)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
