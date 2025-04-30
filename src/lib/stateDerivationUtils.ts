// Utility for state derivation functions related to execution visualization

import {
  TraceEvent,
  StepLinePayload,
  CallPayload,
  ReturnPayload,
  AssignPayload,
  ConsolePayload,
} from "../store/playbackStore";

/**
 * Derives the next and previous highlighted lines for dual highlighting.
 * @returns { nextLine: number | null, prevLine: number | null }
 */
export function deriveHighlightedLine(
  events: TraceEvent[],
  currentEventIndex: number
): { nextLine: number | null; prevLine: number | null } {
  let nextLine: number | null = null;
  let prevLine: number | null = null;

  // Next line logic
  if (
    currentEventIndex >= 0 &&
    currentEventIndex < events.length &&
    events[currentEventIndex].type === "STEP_LINE"
  ) {
    const payload = events[currentEventIndex].payload as StepLinePayload;
    nextLine = payload.line;
  } else if (currentEventIndex >= 0 && currentEventIndex < events.length) {
    // Not a STEP_LINE, try to look ahead for the next STEP_LINE
    for (let i = currentEventIndex + 1; i < events.length; i++) {
      if (events[i].type === "STEP_LINE") {
        const payload = events[i].payload as StepLinePayload;
        nextLine = payload.line;
        break;
      }
    }
  }

  // Previous line logic
  if (currentEventIndex > 0) {
    const prevEvent = events[currentEventIndex - 1];
    if (prevEvent.type === "STEP_LINE") {
      const payload = prevEvent.payload as StepLinePayload;
      prevLine = payload.line;
    } else if (prevEvent.type === "CALL") {
      const payload = prevEvent.payload as CallPayload;
      if (typeof payload.callSiteLine === "number") {
        prevLine = payload.callSiteLine;
      } else {
        // fallback: last STEP_LINE before CALL
        for (let i = currentEventIndex - 2; i >= 0; i--) {
          if (events[i].type === "STEP_LINE") {
            const p = events[i].payload as StepLinePayload;
            prevLine = p.line;
            break;
          }
        }
      }
    } else if (prevEvent.type === "RETURN") {
      const payload = prevEvent.payload as ReturnPayload;
      if (typeof payload.returnLine === "number") {
        prevLine = payload.returnLine;
      } else {
        // fallback: last STEP_LINE within the returned function
        for (let i = currentEventIndex - 2; i >= 0; i--) {
          if (events[i].type === "STEP_LINE") {
            const p = events[i].payload as StepLinePayload;
            prevLine = p.line;
            break;
          }
        }
      }
    } else {
      // fallback: last STEP_LINE before currentEventIndex
      for (let i = currentEventIndex - 1; i >= 0; i--) {
        if (events[i].type === "STEP_LINE") {
          const p = events[i].payload as StepLinePayload;
          prevLine = p.line;
          break;
        }
      }
    }
  }

  return { nextLine, prevLine };
}
import _ from "lodash";
import { CallStackFrame, DisplayScopeInfo } from "../types";

/**
 * Derive scopes mapping using Lodash deep clone, array variables, and type guards
 */
/**
 * Helper to determine a variable's binding type and defining scope.
 */
function _getVariableBindingInfo(
  variableName: string,
  currentLexicalScopeId: string,
  activeScopes: Record<string, DisplayScopeInfo>
): { bindingType: string; definingScopeId: string | null } {
  // Find the defining scope for the variable
  let scopeId: string | null = currentLexicalScopeId;
  let definingScopeId: string | null = null;
  let bindingType: string = "unknown";
  let found = false;

  while (scopeId && activeScopes[scopeId]) {
    const scope: DisplayScopeInfo = activeScopes[scopeId];
    const hasVar = Array.isArray(scope.variables)
      ? scope.variables.some((v: any) => v.varName === variableName)
      : false;
    if (hasVar) {
      definingScopeId = scopeId;
      found = true;
      break;
    }
    scopeId = scope.parentId;
  }

  if (found && definingScopeId) {
    if (definingScopeId === currentLexicalScopeId) {
      bindingType = "local";
    } else if (
      activeScopes[definingScopeId] &&
      activeScopes[definingScopeId].type === "global"
    ) {
      bindingType = "global";
    } else if (
      activeScopes[definingScopeId] &&
      activeScopes[definingScopeId].type === "closure"
    ) {
      bindingType = "closure";
    } else {
      bindingType = "ancestor-non-persistent";
    }
  }

  return { bindingType, definingScopeId };
}

export function deriveScopeState(
  events: TraceEvent[],
  currentEventIndex: number,
  currentCallStack: CallStackFrame[]
): Record<string, DisplayScopeInfo> {
  let originalSnapshot: any[] = [];
  let lastStepLineIdx = -1;

  // Find the most recent STEP_LINE event with scopes
  for (let i = Math.min(currentEventIndex, events.length - 1); i >= 0; i--) {
    const event = events[i];
    if (
      event.type === "STEP_LINE" &&
      event.payload &&
      Array.isArray((event.payload as StepLinePayload).scopes)
    ) {
      originalSnapshot = (event.payload as StepLinePayload).scopes;
      lastStepLineIdx = i;
      break;
    }
  }

  // If no STEP_LINE found, start with a default global scope
  if (lastStepLineIdx === -1) {
    originalSnapshot = [{
      name: "global",
      type: "global",
      variables: [],
      isPersistent: true,
      scopeId: "global",
      parentId: null,
    }];
  }

  // Mark changed variable if ASSIGN event at currentEventIndex
  let changedVarKey: string | null = null;
  if (currentEventIndex >= 0 && currentEventIndex < events.length) {
    const currentEvent = events[currentEventIndex];
    if (
      currentEvent.type === "ASSIGN" &&
      "scopeId" in currentEvent.payload &&
      "varName" in currentEvent.payload
    ) {
      const assignPayload = currentEvent.payload as AssignPayload;
      changedVarKey = `${assignPayload.scopeId}|${assignPayload.varName}`;
    }
  }

  const displayScopes: Record<string, DisplayScopeInfo> = {};
  const activeScopeIds = new Set(currentCallStack.map(frame => frame.scopeId));
  activeScopeIds.add("global");

  // Build a map of scopeId -> DisplayScopeInfo for binding lookup
  let tempScopes: Record<string, DisplayScopeInfo> = {};

  originalSnapshot.forEach(scope => {
    if (!scope) return;
    const clonedScope = _.cloneDeep(scope);
    tempScopes[clonedScope.scopeId] = {
      ...clonedScope,
      isActive: activeScopeIds.has(clonedScope.scopeId) || clonedScope.type === "closure",
      variables: Array.isArray(clonedScope.variables)
        ? clonedScope.variables
        : [],
    };
  });

  Object.values(tempScopes).forEach(clonedScope => {
    const displayScope: DisplayScopeInfo = {
      ...clonedScope,
      variables: [],
    };
    let vars: Array<any> = [];
    if (Array.isArray(clonedScope.variables)) {
      vars = clonedScope.variables;
    } else if (clonedScope.variables && typeof clonedScope.variables === "object") {
      vars = Object.entries(clonedScope.variables).map(([varName, variable]) => ({
        varName,
        ...(typeof variable === "object" && variable !== null ? variable : { value: variable }),
      }));
    }
    displayScope.variables = vars.map(variable => {
      const value = variable.value;
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      const isFunction = (typeof value === 'object' && value !== null && value.type === 'function') ||
                         (typeof value === 'string' && value.startsWith('[Function:'));
      let displayValue: any = value;

      if (isFunction) {
        const functionScopeId = value?.functionScopeId || valueStr.split(':')[1]?.trim() || null;
        if (functionScopeId) {
          displayValue = { type: 'functionRef', id: functionScopeId };
        } else {
          displayValue = "[Function - ID unknown]";
        }
      }

      // Use the new helper to get binding info
      const { bindingType, definingScopeId } = _getVariableBindingInfo(
        variable.varName,
        clonedScope.scopeId,
        tempScopes
      );

      return {
        ...variable,
        value: displayValue,
        hasChanged: `${clonedScope.scopeId}|${variable.varName}` === changedVarKey,
        isClosure: clonedScope.type === "closure" || (variable as any).isBoundByClosure,
        bindingType,
        definingScopeId,
      };
    });
    displayScopes[clonedScope.scopeId] = displayScope;
  });

  return displayScopes;
}

/**
 * Derive call stack frames using scope name map
 */
export function deriveCallStackState(
  events: TraceEvent[],
  currentEventIndex: number,
  scopeIdToNameMap: Map<string, string>
): CallStackFrame[] {
  const stack: CallStackFrame[] = [];
  for (let i = 0; i <= currentEventIndex && i < events.length; i++) {
    const event = events[i];
    if (event.type === "CALL") {
      const payload = event.payload as CallPayload;
      const scopeId = payload.newScopeId || "";
      const functionName = scopeIdToNameMap.get(scopeId) || "anonymous"; // Use mapped name
      
      // Ensure the pushed object matches the updated CallStackFrame type
      stack.push({
        functionName: functionName, // Correct property name
        type: payload.closureScopeId ? "closure" : "normal",
        line: payload.callSiteLine ?? undefined,
        scopeId: scopeId,
      });
    } else if (event.type === "RETURN") {
      if (stack.length > 0) stack.pop();
    }
  }
  return stack;
}
import { HeapFunctionObject } from "../types";

/**
 * Derive Heap Objects (Functions)
 */
export function deriveHeapObjects(
  events: TraceEvent[],
  currentEventIndex: number,
  scopeIdToNameMap: Map<string, string>
): Record<string, HeapFunctionObject> {
  const heapObjects: Record<string, HeapFunctionObject> = {};

  // Iterate through events up to the current index to find function definitions/assignments
  for (let i = 0; i <= currentEventIndex && i < events.length; i++) {
    const event = events[i];
    let targetPayload: AssignPayload | null = null;
    let scopeSnapshot: any[] | undefined;
    
    // Look for assignments or returns that might involve functions
    // Assumption: Function info (like its scopeId and defining scope) is part of the value payload
    if (event.type === "ASSIGN") {
      targetPayload = event.payload as AssignPayload;
      // Find the most recent scope snapshot *before or at* this event
      for (let j = i; j >= 0; j--) {
          if (events[j].type === "STEP_LINE" && (events[j].payload as StepLinePayload)?.scopes) {
              scopeSnapshot = (events[j].payload as StepLinePayload).scopes;
              break;
          }
      }
    } else if (event.type === "RETURN") {
       // Similar logic might be needed for RETURN if functions can be returned
       // targetPayload = event.payload as ReturnPayload; // Check returnValue
       // scopeSnapshot = ... find previous STEP_LINE ...
    } else if (event.type === "STEP_LINE") {
        // Check for nested ASSIGN events if backend structures them this way
        // Example: if ((event.payload as StepLinePayload)?.subEvent?.type === 'ASSIGN') { targetPayload = (event.payload as StepLinePayload).subEvent.payload; scopeSnapshot = (event.payload as StepLinePayload).scopes }
    }


    if (targetPayload && targetPayload.newValue) {
      const value = targetPayload.newValue;
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value); // Handle potential object values

      // Basic check for function representation (adjust based on actual backend output)
      // Assumption: Backend provides `functionScopeId` and `definingScopeId` on the value object
      const isFunction = (typeof value === 'object' && value !== null && value.type === 'function') ||
                         (typeof value === 'string' && value.startsWith('[Function:')); // Fallback string check

      if (isFunction) {
        const functionScopeId = value?.functionScopeId || valueStr.split(':')[1]?.trim() || `unknown-func-${i}`; // Extract ID if possible
        const definingScopeId = value?.definingScopeId || targetPayload.scopeId || null; // Best guess for defining scope
        const functionName = scopeIdToNameMap.get(functionScopeId) || value?.name || 'anonymous';

        if (!heapObjects[functionScopeId]) {
           heapObjects[functionScopeId] = {
            id: functionScopeId,
            type: 'function',
            name: functionName,
            // TODO: Get actual code snippet from backend if possible
            codeSnippet: `function ${functionName}(...) { ... }`,
            definingScopeId: definingScopeId,
          };
        }
      }
    }
  }

  return heapObjects;
}
// --- Extracted from App.tsx ---

/** Derive plain-text explanation */
export function deriveExplanation(
  event: TraceEvent,
  scopeIdToNameMap: Map<string, string>
): string {
  if (!event) return "No event.";

  switch (event.type) {
    case "STEP_LINE": {
      const payload = event.payload as StepLinePayload;
      const statementType = payload.statementType
        ? ` (${payload.statementType})`
        : "";
      return `Executing line ${payload.line}${statementType}.`;
    }
    case "CALL": {
      const payload = event.payload as CallPayload;
      const funcName = payload.funcName || "anonymous";
      const scopeName =
        (payload.newScopeId && scopeIdToNameMap.get(payload.newScopeId)) ||
        payload.newScopeId ||
        "unknown-scope";
      const callSiteLine =
        payload.callSiteLine !== null && payload.callSiteLine !== undefined
          ? payload.callSiteLine
          : "?";
      const args =
        payload.args && Array.isArray(payload.args)
          ? payload.args.map((a: any) =>
              typeof a === "object" ? JSON.stringify(a) : String(a)
            )
          : [];
      const argsStr = args.length > 0 ? `(${args.join(", ")})` : "()";
      return `Calling function '${funcName}'${argsStr} from line ${callSiteLine}. Creating scope ${scopeName}.`;
    }
    case "RETURN": {
      const payload = event.payload as ReturnPayload;
      const funcName = payload.funcName || "anonymous";
      const returnValue = JSON.stringify(payload.returnValue);
      const exitingScope =
        (payload.exitingScopeId && scopeIdToNameMap.get(payload.exitingScopeId)) ||
        payload.exitingScopeId ||
        "unknown-scope";
      return `Returning ${returnValue} from function '${funcName}'. Exiting scope ${exitingScope}.`;
    }
    case "ASSIGN": {
      const payload = event.payload as AssignPayload;
      const scopeName =
        (payload.scopeId && scopeIdToNameMap.get(payload.scopeId)) ||
        payload.scopeId ||
        "unknown-scope";
      const valueStr =
        typeof payload.newValue === "object"
          ? JSON.stringify(payload.newValue)
          : String(payload.newValue);
      const lineStr =
        payload.line !== undefined && payload.line !== null
          ? payload.line
          : "?";
      return `Assigning ${valueStr} to variable '${payload.varName}' in scope '${scopeName}' (line ${lineStr}).`;
    }
    case "CONSOLE": {
      const payload = event.payload as ConsolePayload;
      return `Printing to console: ${payload.text?.trim()}`;
    }
    default:
      return `Processing event type: ${event.type}`;
  }
}

/** Derive console output lines */
export function deriveConsoleOutput(events: TraceEvent[], currentEventIndex: number): string[] {
  const output: string[] = [];
  for (let i = 0; i < currentEventIndex && i < events.length; i++) {
    if (events[i].type === "CONSOLE") {
      const payload = events[i].payload as ConsolePayload;
      output.push(payload.text?.trim());
    }
  }
  return output;
}