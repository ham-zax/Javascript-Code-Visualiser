// src/App.tsx
import React, { useState, useMemo, useEffect } from "react";
import _ from "lodash";
import { TraceEvent } from "./store/playbackStore";
import { usePlaybackStore } from "./store/playbackStore";

import { 
  HeapFunctionObject,
  CallStackFrame, 
  DisplayScopeInfo
} from "./types";
import CodeEditor from "./components/CodeEditor";
import ExecutionControls from "./components/ExecutionControls";
import VisualizationState from "./components/VisualizationState";
import { ConsolePane } from "./components/ConsolePane";
// import ExplanationOutput from "./components/ExplanationOutput";
// import SettingsPanel from "./components/SettingsPanel";
// import { examples } from "./lib/codeExamples";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Settings } from "lucide-react";

/** Derive call stack frames using scope name map */
function deriveCallStackState(
  events: TraceEvent[],
  idx: number,
  scopeIdToNameMap: Map<string, string>
): CallStackFrame[] {
  const stack: CallStackFrame[] = [];
  for (let i = 0; i <= idx && i < events.length; i++) {
    const event = events[i];
    if (event.type === "CALL") {
      const payload = event.payload as any;
      const scopeId = payload.newScopeId || payload.scopeId || "";
      const functionName = scopeIdToNameMap.get(scopeId) || "anonymous"; // Use mapped name

      // Ensure the pushed object matches the updated CallStackFrame type
      stack.push({
        functionName: functionName, // Correct property name
        type: payload.closureScopeId ? "closure" : "normal",
        line:
          "line" in payload && typeof payload.line === "number"
            ? payload.line
            : payload.callSiteLine ?? undefined,
        scopeId: scopeId,
      });
    } else if (event.type === "RETURN") {
      if (stack.length > 0) stack.pop();
    }
  }
  return stack;
}

/** Derive scopes mapping using Lodash deep clone, array variables, and type guards */
function deriveScopeState(
  events: TraceEvent[],
  idx: number,
  currentCallStack: CallStackFrame[]
): Record<string, DisplayScopeInfo> {
  let originalSnapshot: any[] = [];
  let lastStepLineIdx = -1;

  // Find the most recent STEP_LINE event with scopes
  for (let i = Math.min(idx, events.length - 1); i >= 0; i--) {
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

  // Mark changed variable if ASSIGN event at idx
  let changedVarKey: string | null = null;
  if (idx >= 0 && idx < events.length) {
    const currentEvent = events[idx];
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


/** Derive Heap Objects (Functions) */
function deriveHeapObjects(
  events: TraceEvent[],
  idx: number,
  scopeIdToNameMap: Map<string, string>
): Record<string, HeapFunctionObject> {
  const heapObjects: Record<string, HeapFunctionObject> = {};

  // Iterate through events up to the current index to find function definitions/assignments
  for (let i = 0; i <= idx && i < events.length; i++) {
    const event = events[i];
    let targetPayload: any = null;
    let scopeSnapshot: any[] | undefined;

    // Look for assignments or returns that might involve functions
    // Assumption: Function info (like its scopeId and defining scope) is part of the value payload
    if (event.type === "ASSIGN") {
      targetPayload = event.payload as any;
      // Find the most recent scope snapshot *before or at* this event
      for (let j = i; j >= 0; j--) {
          if (events[j].type === "STEP_LINE" && (events[j].payload as any)?.scopes) {
              scopeSnapshot = (events[j].payload as any).scopes;
              break;
          }
      }
    } else if (event.type === "RETURN") {
       // Similar logic might be needed for RETURN if functions can be returned
       // targetPayload = event.payload as any; // Check returnValue
       // scopeSnapshot = ... find previous STEP_LINE ...
    } else if (event.type === "STEP_LINE") {
        // Check for nested ASSIGN events if backend structures them this way
        // Example: if (event.payload?.subEvent?.type === 'ASSIGN') { targetPayload = event.payload.subEvent.payload; scopeSnapshot = event.payload.scopes }
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


/** Derive plain-text explanation */
function deriveExplanation(events: TraceEvent[], idx: number): string {
  if (idx < 0 || idx >= events.length) {
    return idx === -1 ? "Execution not started." : "Execution finished.";
  }
  const event = events[idx];
  const payload = event.payload as any;
  switch (event.type) {
    case "STEP_LINE":
      return `Executing line ${payload.line}. Statement type: ${payload.statementType || "unknown"}.`;
    case "CALL":
      return `Calling function "${payload.funcName || "anonymous"}" from line ${
        "line" in payload && typeof payload.line === "number"
          ? payload.line
          : payload.callSiteLine || "?"
      }. Creating scope ${payload.newScopeId}.`;
    case "RETURN":
      return `Returning value ${JSON.stringify(payload.returnValue)} from function "${payload.funcName || "anonymous"}". Exiting scope ${payload.exitingScopeId}.`;
    case "ASSIGN":
      return `Assigning value ${JSON.stringify(payload.newValue)} to variable "${payload.varName}" in scope ${payload.scopeId} (line ${
        "line" in payload && typeof payload.line === "number" ? payload.line : "?"
      }).`;
    case "CONSOLE":
      return `Printing to console: ${payload.text?.trim()}`;
    default:
      return `Processing event type: ${event.type}`;
  }
}

/** Derive console output lines */
function deriveConsoleOutput(events: TraceEvent[], idx: number): string[] {
  const output: string[] = [];
  for (let i = 0; i < idx && i < events.length; i++) {
    if (events[i].type === "CONSOLE") {
      output.push((events[i].payload as any).text?.trim());
    }
  }
  return output;
}

/** Derive highlighted source line */
/**
 * Derives the next and previous highlighted lines for dual highlighting.
 * @returns { nextLine: number | null, prevLine: number | null }
 */
function deriveHighlightedLine(
  events: any[], // TraceEvent[]
  idx: number
): { nextLine: number | null; prevLine: number | null } {
  let nextLine: number | null = null;
  let prevLine: number | null = null;

  // Next line logic
  if (
    idx >= 0 &&
    idx < events.length &&
    events[idx].type === "STEP_LINE"
  ) {
    const payload = events[idx].payload as { line?: number };
    if (typeof payload.line === "number") {
      nextLine = payload.line;
    }
  } else if (idx >= 0 && idx < events.length) {
    // Not a STEP_LINE, try to look ahead for the next STEP_LINE
    for (let i = idx + 1; i < events.length; i++) {
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
  if (idx > 0) {
    const prevEvent = events[idx - 1];
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
        for (let i = idx - 2; i >= 0; i--) {
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
        for (let i = idx - 2; i >= 0; i--) {
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
      // fallback: last STEP_LINE before idx
      for (let i = idx - 1; i >= 0; i--) {
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

const DEFAULT_CODE = `function greet(name) {
  console.log("Hello, " + name + "!");
}
greet("World");
`;

function App() {
  // Destructure all needed values from the store *once*
  const { events, idx, setEvents, replayTo, setIdx, isPlaying, speed } = usePlaybackStore();
  const [currentCode, setCurrentCode] = useState(DEFAULT_CODE);
  const [isRunning, setIsRunning] = useState(false);

  // --- State Derivation ---

  // 1. Scope ID to Name Mapping (using useRef as it doesn't trigger re-render itself)
  const scopeIdToNameMap = React.useRef<Map<string, string>>(new Map());

  // Populate the map whenever events change
  useEffect(() => {
    const newMap = new Map<string, string>();
    newMap.set("global", "Global"); // Initialize global scope
    events.forEach(event => {
      if (event.type === "CALL") {
        const payload = event.payload as any;
        const scopeId = payload.newScopeId || payload.scopeId;
        const funcName = payload.funcName || payload.functionName;
        if (scopeId && funcName) {
          newMap.set(scopeId, funcName);
        } else if (scopeId) {
          // Fallback if name is missing
          newMap.set(scopeId, `scope-${scopeId.substring(0, 4)}`);
        }
      }
    });
    scopeIdToNameMap.current = newMap;
    // console.log("Updated scopeIdToNameMap:", scopeIdToNameMap.current); // For debugging
  }, [events]);

  // 2. Derived Call Stack (now uses the map)
  const derivedCallStack = useMemo(
    () => deriveCallStackState(events, idx, scopeIdToNameMap.current),
    [events, idx] // Dependency on map ref's *content* is implicit via events/idx
  );

  // 3. Derived Scopes (placeholder for heap object linking)
  const derivedScopesRecord = useMemo(
    () => deriveScopeState(events, idx, derivedCallStack),
    [events, idx, derivedCallStack]
  );
  // Convert scopes record to array for VisualizationState prop
  const derivedScopesArray = useMemo(() => Object.values(derivedScopesRecord), [derivedScopesRecord]);


  // 4. Derived Heap Objects
  const derivedHeapObjects = useMemo(
      () => deriveHeapObjects(events, idx, scopeIdToNameMap.current),
      [events, idx] // Depends on events and current index
  );

  // 5. Other derived states
  const totalSteps = useMemo(() => events.length, [events]);
  const derivedExplanation = useMemo(() => deriveExplanation(events, idx), [events, idx]);
  const derivedConsole = useMemo(() => deriveConsoleOutput(events, idx), [events, idx]);
  const derivedHighlightLine = useMemo(() => deriveHighlightedLine(events, idx), [events, idx]);
  // NOTE: derivedHighlightLine is now { nextLine, prevLine }

  // 6. Derived Persistent Environments
  const persistentEnvironments = useMemo(() => {
    const activeScopeIds = new Set(derivedCallStack.map(frame => frame.scopeId));
    activeScopeIds.add("global"); // Global scope is always considered "active" in a sense

    const persistent: DisplayScopeInfo[] = [];

    Object.values(derivedHeapObjects).forEach(heapObj => {
      if (heapObj.type === 'function' && heapObj.definingScopeId) {
        if (!activeScopeIds.has(heapObj.definingScopeId)) {
          const scope = derivedScopesRecord[heapObj.definingScopeId];
          // Ensure the scope exists and isn't already added (though duplicates are unlikely here)
          if (scope && !persistent.some(p => p.scopeId === scope.scopeId)) {
            persistent.push(scope);
          }
        }
      }
    });

    return persistent;
  }, [derivedCallStack, derivedHeapObjects, derivedScopesRecord]);


  // --- WebSocket Logic ---
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Establish WebSocket connection on mount
  useEffect(() => {
    const socketProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${socketProtocol}//${window.location.host}/ws`);
    socket.onopen = () => setWs(socket);

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "STORY_LIST") {
          setEvents(msg.payload);
          replayTo(0);
          setIsRunning(false);
        }
        if (msg.type === "EXECUTION_ERROR") {
          setEvents([]);
          replayTo(0);
          setIsRunning(false);
          // Optionally show error to user
        }
      } catch (e) {
        // Optionally handle parse error
        setIsRunning(false);
      }
    };

    socket.onerror = () => {
      // Optionally show error to user
    };

    socket.onclose = () => {
      // Optionally show disconnect to user
    };

    return () => {
      socket.close();
    };
  }, [setEvents, replayTo]);

  // Auto-play effect
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (isPlaying && idx < totalSteps) {
      timer = setTimeout(() => {
        setIdx(idx + 1);
      }, 1000 / speed);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, idx, totalSteps, speed, setIdx]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm p-4 border-b">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-800">
            JS Visualizer
          </h1>
          <div className="flex gap-2 items-center">
            <Button
              variant="default"
              size="sm"
              className="flex items-center"
              disabled={!ws || ws.readyState !== WebSocket.OPEN || isRunning}
              onClick={() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                  setIsRunning(true);
                  ws.send(JSON.stringify({ type: "RUN_CODE", payload: currentCode }));
                }
              }}
            >
              {isRunning ? "Running..." : "Run"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center"
              onClick={() => {
                setCurrentCode(DEFAULT_CODE);
                setIsRunning(false);
              }}
              disabled={isRunning}
            >
              Reset
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center">
                  <Settings className="h-4 w-4 mr-1" /> Settings
                </Button>
              </SheetTrigger>
              <SheetContent>
                {/* <SettingsPanel /> */}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Col 1: Code & Controls */}
          <div className="space-y-6">
            {/* Pass both nextLine and prevLine for dual highlighting */}
            <CodeEditor code={currentCode} highlightInfo={derivedHighlightLine} onChange={setCurrentCode} />
            <ExecutionControls />
          </div>

          {/* Col 2: Visualization & Explanation */}
          <div className="space-y-6">
            <VisualizationState callStack={derivedCallStack} scopes={derivedScopesArray} heapObjects={derivedHeapObjects} persistentEnvironments={persistentEnvironments} />
            <ConsolePane lines={derivedConsole} />
            {/* <ExplanationOutput explanation={derivedExplanation} consoleOutput={derivedConsole} /> */}
          </div>
        </div>
      </main>

      {/* Footer (Optional) */}
      <footer className="bg-white border-t p-3 text-center text-gray-500 text-xs">
        JS Visualizer Footer
      </footer>
    </div>
  );
}

export default App;
