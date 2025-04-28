// src/App.tsx
import React, { useState, useMemo, useEffect } from "react";
import _ from "lodash";
import { TraceEvent } from "./store/playbackStore";
import { usePlaybackStore } from "./store/playbackStore";

// Local types for derived state
type CallStackFrame = {
  name: string;
  type: string;
  line?: number;
  scopeId: string;
};

type DisplayScopeInfo = {
  name: string;
  type: string;
  variables: Array<{
    varName: string;
    value: any;
    hasChanged?: boolean;
    isClosure?: boolean;
  }>;
  isPersistent?: boolean;
  scopeId: string;
  parentId: string | null;
  isActive: boolean;
};
import CodeEditor from "./components/CodeEditor";
import ExecutionControls from "./components/ExecutionControls";
import VisualizationState from "./components/VisualizationState";
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

/** Derive call stack frames */
function deriveCallStackState(events: TraceEvent[], idx: number): CallStackFrame[] {
  const stack: CallStackFrame[] = [];
  for (let i = 0; i <= idx && i < events.length; i++) {
    const event = events[i];
    if (event.type === "CALL") {
      const payload = event.payload as any;
      stack.push({
        name: payload.funcName || payload.functionName || "anonymous",
        type: payload.closureScopeId ? "closure" : "normal",
        line:
          "line" in payload && typeof payload.line === "number"
            ? payload.line
            : payload.callSiteLine ?? undefined,
        scopeId: payload.newScopeId || payload.scopeId || "",
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
    displayScope.variables = vars.map(variable => ({
      ...variable,
      hasChanged: `${clonedScope.scopeId}|${variable.varName}` === changedVarKey,
      isClosure: clonedScope.type === "closure" || (variable as any).isBoundByClosure,
    }));
    displayScopes[clonedScope.scopeId] = displayScope;
  });

  return displayScopes;
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
function deriveHighlightedLine(events: TraceEvent[], idx: number): number | null {
  if (
    idx >= 0 &&
    idx < events.length &&
    events[idx].type === "STEP_LINE"
  ) {
    const payload = events[idx].payload as { line?: number };
    if (typeof payload.line === "number") {
      return payload.line;
    }
  }
  for (let i = idx - 1; i >= 0; i--) {
    if (events[i].type === "STEP_LINE") {
      const payload = events[i].payload as { line?: number };
      if (typeof payload.line === "number") {
        return payload.line;
      }
    }
  }
  return null;
}

const DEFAULT_CODE = `function greet(name) {
  console.log("Hello, " + name + "!");
}
greet("World");
`;

function App() {
  const { events, idx /* ... other store values ... */ } = usePlaybackStore();
  const [currentCode, setCurrentCode] = useState(DEFAULT_CODE);
  const [isRunning, setIsRunning] = useState(false);

  // Derived state
  const totalSteps = useMemo(() => events.length, [events]);
  const derivedCallStack = useMemo(() => deriveCallStackState(events, idx), [events, idx]);
  const derivedScopes = useMemo(() => deriveScopeState(events, idx, derivedCallStack), [events, idx, derivedCallStack]);
  const derivedExplanation = useMemo(() => deriveExplanation(events, idx), [events, idx]);
  const derivedConsole = useMemo(() => deriveConsoleOutput(events, idx), [events, idx]);
  const derivedHighlightLine = useMemo(() => deriveHighlightedLine(events, idx), [events, idx]);

  // WebSocket logic
  const { setEvents, replayTo, setIdx, isPlaying, speed } = usePlaybackStore();
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
            JS Visualizer (New Layout)
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
            <CodeEditor code={currentCode} highlightedLine={derivedHighlightLine} onChange={setCurrentCode} />
            <ExecutionControls />
          </div>

          {/* Col 2: Visualization & Explanation */}
          <div className="space-y-6">
            <VisualizationState callStack={derivedCallStack} scopes={derivedScopes} />
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
