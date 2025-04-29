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

// Types for React Flow Custom Nodes

export type PrimitiveValue = string | number | boolean | null | undefined | symbol | bigint;

export type Variable =
  | { type: 'primitive'; value: PrimitiveValue }
  | { type: 'reference'; heapId: string }
  | { type: 'function'; name?: string; heapId: string }; // Functions are also on the heap

export interface FrameData {
  name: string;
  variables: Record<string, Variable>;
  // Add other frame-specific data if needed
}

export interface HeapObjectData {
  id: string;
  type: 'object' | 'array' | 'function';
  properties?: Record<string, Variable>; // For objects and arrays with string keys
  value?: PrimitiveValue[]; // For simple arrays
  functionDetails?: {
      name?: string;
      paramCount: number;
      // codeSnippet?: string; // Maybe add later
  };
  closureScopeId?: string; // Link to persistent env for closures
}

export interface PersistentEnvData {
    name: string; // e.g., "Closure Scope (foo)", "Global Scope"
    variables: Record<string, Variable>;
}
