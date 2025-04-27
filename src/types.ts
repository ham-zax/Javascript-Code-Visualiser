export interface SimulationSnapshot {
  description?: string;
  highlightedLines?: number[];
  executionPointer?: { scriptId: string; line: number; column: number };
  callStack: Array<{
    id: string;
    functionName: string;
    localScope: Record<string, any>;
    closureScopeLink?: string;
  }>;
  scopes?: Array<{
    scopeId: string;
    type: 'global' | 'local';
    bindings: Record<string, any>;
    parentScopeId?: string;
  }>;
  globalScope?: Record<string, { value: any; type?: string }>;
  output: string[];
}