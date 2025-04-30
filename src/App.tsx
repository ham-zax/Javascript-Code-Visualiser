// src/App.tsx
import React, { useState, useMemo, useEffect } from "react";
import _ from "lodash";
import { TraceEvent } from "./store/playbackStore";
import { usePlaybackStore } from "./store/playbackStore";
import { deriveScopeState, deriveHighlightedLine, deriveCallStackState, deriveHeapObjects, deriveExplanation, deriveConsoleOutput } from "./lib/stateDerivationUtils";

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
} from "@/components/ui/sheet";
import { Settings } from "lucide-react";


/**
 * Derives the next and previous highlighted lines for dual highlighting.
 * @returns { nextLine: number | null, prevLine: number | null }
 */

const DEFAULT_CODE = `function createCounter() {
  let count = 0; // Declaration
  return function() {
    count = count + 1; // Assignment
    return count;
  };
}
const counter = createCounter();
counter(); // First call, count becomes 1
counter(); // Second call, count becomes 2
`;

function App() {
  // Destructure all needed values from the store *once*
  const { events, currentEventIndex, setEvents, replayTo, setCurrentEventIndex, isPlaying, speed } = usePlaybackStore(); // Renamed from idx
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
    () => deriveCallStackState(events, currentEventIndex, scopeIdToNameMap.current), // Renamed from idx
    [events, currentEventIndex] // Dependency on map ref's *content* is implicit via events/currentEventIndex // Renamed from idx
  );

  // 3. Derived Scopes (placeholder for heap object linking)
  const derivedScopesRecord = useMemo(
    () => deriveScopeState(events, currentEventIndex, derivedCallStack), // Renamed from idx
    [events, currentEventIndex, derivedCallStack] // Renamed from idx
  );
  // Convert scopes record to array for VisualizationState prop
  const derivedScopesArray = useMemo(() => Object.values(derivedScopesRecord) as DisplayScopeInfo[], [derivedScopesRecord]);


  // 4. Derived Heap Objects
  const derivedHeapObjects = useMemo(
      () => deriveHeapObjects(events, currentEventIndex, scopeIdToNameMap.current), // Renamed from idx
      [events, currentEventIndex] // Depends on events and current index // Renamed from idx
  );

  // 5. Other derived states
  const totalSteps = useMemo(() => events.length, [events]);
  const derivedExplanation = useMemo(() => {
    const event = events[currentEventIndex];
    return event
      ? deriveExplanation(event, scopeIdToNameMap.current)
      : currentEventIndex === -1
        ? "Execution not started."
        : "Execution finished.";
  }, [events, currentEventIndex, scopeIdToNameMap.current]);
  const derivedConsole = useMemo(() => deriveConsoleOutput(events, currentEventIndex), [events, currentEventIndex]); // Renamed from idx
  const derivedHighlightLine = useMemo(() => deriveHighlightedLine(events, currentEventIndex), [events, currentEventIndex]); // Renamed from idx
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
    if (isPlaying && currentEventIndex < totalSteps) { // Renamed from idx
      timer = setTimeout(() => {
        setCurrentEventIndex(currentEventIndex + 1); // Use setter, rename internal usage // Renamed from idx
      }, 1000 / speed);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, currentEventIndex, totalSteps, speed, setCurrentEventIndex]); // Renamed from idx

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
