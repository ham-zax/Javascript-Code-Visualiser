// Utility for state derivation functions related to execution visualization

import { TraceEvent } from "../store/playbackStore";

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
    const payload = events[currentEventIndex].payload as { line?: number };
    if (typeof payload.line === "number") {
      nextLine = payload.line;
    }
  } else if (currentEventIndex >= 0 && currentEventIndex < events.length) {
    // Not a STEP_LINE, try to look ahead for the next STEP_LINE
    for (let i = currentEventIndex + 1; i < events.length; i++) {
      if (events[i].type === "STEP_LINE") {
        const payload = events[i].payload as { line?: number };
        if (typeof payload.line === "number") {
          nextLine = payload.line;
          break;
        }
      }
    }
  }

  // Previous line logic
  if (currentEventIndex > 0) {
    const prevEvent = events[currentEventIndex - 1];
    if (prevEvent.type === "STEP_LINE") {
      const payload = prevEvent.payload as { line?: number };
      if (typeof payload.line === "number") {
        prevLine = payload.line;
      }
    } else if (prevEvent.type === "CALL") {
      const payload = prevEvent.payload as { callSiteLine?: number };
      if (typeof payload.callSiteLine === "number") {
        prevLine = payload.callSiteLine;
      } else {
        // fallback: last STEP_LINE before CALL
        for (let i = currentEventIndex - 2; i >= 0; i--) {
          if (events[i].type === "STEP_LINE") {
            const p = events[i].payload as { line?: number };
            if (typeof p.line === "number") {
              prevLine = p.line;
              break;
            }
          }
        }
      }
    } else if (prevEvent.type === "RETURN") {
      const payload = prevEvent.payload as { returnLine?: number };
      if (typeof payload.returnLine === "number") {
        prevLine = payload.returnLine;
      } else {
        // fallback: last STEP_LINE within the returned function
        for (let i = currentEventIndex - 2; i >= 0; i--) {
          if (events[i].type === "STEP_LINE") {
            const p = events[i].payload as { line?: number };
            if (typeof p.line === "number") {
              prevLine = p.line;
              break;
            }
          }
        }
      }
    } else {
      // fallback: last STEP_LINE before currentEventIndex
      for (let i = currentEventIndex - 1; i >= 0; i--) {
        if (events[i].type === "STEP_LINE") {
          const p = events[i].payload as { line?: number };
          if (typeof p.line === "number") {
            prevLine = p.line;
            break;
          }
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
      Array.isArray((event.payload as any).scopes)
    ) {
      originalSnapshot = (event.payload as any).scopes;
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
      changedVarKey = `${currentEvent.payload.scopeId}|${currentEvent.payload.varName}`;
    }
  }

  const displayScopes: Record<string, DisplayScopeInfo> = {};
  const activeScopeIds = new Set(currentCallStack.map(frame => frame.scopeId));
  activeScopeIds.add("global");

  originalSnapshot.forEach(scope => {
    if (!scope) return;
    const clonedScope = _.cloneDeep(scope);
    const displayScope: DisplayScopeInfo = {
      ...clonedScope,
      isActive: activeScopeIds.has(clonedScope.scopeId) || clonedScope.type === "closure",
      variables: [],
    };
    // Convert variables object or array to array of variable objects
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
            const functionScopeId = value?.functionScopeId || valueStr.split(':')[1]?.trim() || null; // Extract ID if possible
            if (functionScopeId) {
                // Store a reference instead of the raw value
                displayValue = { type: 'functionRef', id: functionScopeId };
            } else {
                displayValue = "[Function - ID unknown]"; // Fallback if ID cannot be determined
            }
        }

        return {
            ...variable,
            value: displayValue, // Use the potentially modified value (reference or primitive)
            hasChanged: `${clonedScope.scopeId}|${variable.varName}` === changedVarKey,
            isClosure: clonedScope.type === "closure" || (variable as any).isBoundByClosure,
        };
    });
    displayScopes[clonedScope.scopeId] = displayScope;
  });

  return displayScopes;
}