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

// Shared types for visualization components
export type HeapFunctionObject = {
  id: string;
  type: 'function';
  name: string;
  codeSnippet: string;
  definingScopeId: string | null;
};

export interface CallStackFrame {
  functionName: string;
  type: string;
  line?: number;
  scopeId: string;
}

export interface VariableInfo {
  varName: string;
  value: any | { type: 'functionRef'; id: string };
  isClosure?: boolean;
  hasChanged?: boolean;
}

export interface DisplayScopeInfo {
  scopeId: string;
  parentId: string | null;
  type: string;
  name: string;
  variables: VariableInfo[];
  isActive?: boolean;
  isPersistent?: boolean;
  thisBinding?: any;
}

// Helper interface for building the tree
export interface ScopeNode extends DisplayScopeInfo {
  children: ScopeNode[];
}
