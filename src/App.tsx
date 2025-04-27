// src/App.tsx
import { useEffect, useRef, useState, useCallback, ChangeEvent } from 'react' // Add ChangeEvent
import { Toaster, toast } from 'sonner'

import { CodeViewer, CodeViewerHandle } from './components/CodeViewer'
import { ConsolePane, ConsolePaneHandle } from './components/ConsolePane'
// Import Frame interface
import { CallStackPanel, CallStackPaneHandle, Frame } from './components/CallStackPanel'
import { GlobalScopePane, GlobalScopePaneHandle } from './components/GlobalScopePane'
import { Controls } from './components/Controls'
import { Legend } from './components/Legend'
// Import NarrativePane (assuming it will be created)
// import { NarrativePane } from './components/NarrativePane';

type EventPayload = any

interface TraceEvent {
  type: string
  payload: EventPayload
}

// Define Example structure
interface NarrativeStep {
  step: number; // Corresponds to the event index (idx) + 1
  text: string;
}
interface Example {
  id: string;
  title: string;
  code: string;
  narrative?: NarrativeStep[]; // Optional narrative
}

// Sample Examples (Keep this outside the component for clarity)
const examples: Example[] = [
  {
    id: 'hello',
    title: 'Hello World',
    code: `// Simple function call
function hello(name) {
  console.log("Hello, " + name);
  let x = 1; // Local variable
}
hello("World");`,
    narrative: [
      { step: 1, text: "Call the 'hello' function with argument 'World'." },
      { step: 2, text: "Inside 'hello', log the message to the console." },
      { step: 3, text: "Declare a local variable 'x' and assign it the value 1." },
      { step: 4, text: "Return from the 'hello' function." },
    ]
  },
  {
    id: 'loop',
    title: 'Loop Demo',
    code: `// Simple for loop
let sum = 0;
for (let i = 0; i < 3; i++) {
  sum = sum + i;
  console.log("i=" + i + ", sum=" + sum);
}
console.log("Final sum: " + sum);`,
    narrative: [
      { step: 1, text: "Declare global variable 'sum' and initialize to 0." },
      { step: 2, text: "Start the for loop, initialize local 'i' to 0." },
      { step: 3, text: "Check loop condition (0 < 3 is true)." },
      { step: 4, text: "Update 'sum' (0 + 0 = 0)." },
      { step: 5, text: "Log current 'i' and 'sum'." },
      { step: 6, text: "Increment 'i' (i becomes 1)." },
      { step: 7, text: "Check loop condition (1 < 3 is true)." },
      { step: 8, text: "Update 'sum' (0 + 1 = 1)." },
      { step: 9, text: "Log current 'i' and 'sum'." },
      { step: 10, text: "Increment 'i' (i becomes 2)." },
      { step: 11, text: "Check loop condition (2 < 3 is true)." },
      { step: 12, text: "Update 'sum' (1 + 2 = 3)." },
      { step: 13, text: "Log current 'i' and 'sum'." },
      { step: 14, text: "Increment 'i' (i becomes 3)." },
      { step: 15, text: "Check loop condition (3 < 3 is false)." },
      { step: 16, text: "Exit the loop." },
      { step: 17, text: "Log the final value of 'sum'." },
    ]
  },
  {
    id: 'conditional',
    title: 'Conditional',
    code: `// If/else statement
function checkSign(num) {
  if (num > 0) {
    console.log("Positive");
  } else if (num < 0) {
    console.log("Negative");
  } else {
    console.log("Zero");
  }
}
checkSign(5);
checkSign(-2);`,
    narrative: [
      { step: 1, text: "Call 'checkSign' with argument 5." },
      { step: 2, text: "Inside 'checkSign', check if num > 0 (5 > 0 is true)." },
      { step: 3, text: "Log 'Positive'." },
      { step: 4, text: "Return from 'checkSign'." },
      { step: 5, text: "Call 'checkSign' with argument -2." },
      { step: 6, text: "Inside 'checkSign', check if num > 0 (-2 > 0 is false)." },
      { step: 7, text: "Check if num < 0 (-2 < 0 is true)." },
      { step: 8, text: "Log 'Negative'." },
      { step: 9, text: "Return from 'checkSign'." },
    ]
  },
  {
    id: 'scope',
    title: 'Scope Test',
    code: `// Global vs Local Scope
let g = 1; // Global
function update() {
  let g = 2; // Local, shadows global
  console.log("Local g:", g);
}
console.log("Global g before:", g);
update();
console.log("Global g after:", g);`,
    narrative: [
      { step: 1, text: "Declare global variable 'g' and assign 1." },
      { step: 2, text: "Log the initial value of global 'g'." },
      { step: 3, text: "Call the 'update' function." },
      { step: 4, text: "Inside 'update', declare a local variable 'g' (shadowing the global) and assign 2." },
      { step: 5, text: "Log the value of the local 'g'." },
      { step: 6, text: "Return from 'update'." },
      { step: 7, text: "Log the value of global 'g' again (it should still be 1)." },
    ]
  },
  // Add more examples (async, this) later
];


export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <header className="sticky top-0 z-10 bg-white shadow-sm p-4 flex justify-between items-center border-b">
        <h2 className="text-xl font-semibold text-indigo-700">
          JS Execution Visualizer
        </h2>
      </header>
      <main className="flex-1 p-4 md:p-8">
        <Visualizer />
      </main>
      <Toaster />
    </div>
  )
}

function Visualizer() {
  // 1) WebSocket & story events
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [events, setEvents] = useState<TraceEvent[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 2) playhead index and current execution context for hover
  const [idx, setIdx] = useState(0)
  const [currentGlobals, setCurrentGlobals] = useState<Record<string, any>>({})
  const [currentFrames, setCurrentFrames] = useState<Frame[]>([])

  // 3) Code input, examples, and hints state
  const [selectedExampleId, setSelectedExampleId] = useState<string>(examples[0].id);
  const [codeInput, setCodeInput] = useState<string>(examples[0].code); // Initialize with first example's code
  const [showHints, setShowHints] = useState<boolean>(true); // Default to showing hints

  // Get the currently selected example object (memoize if examples list grows large)
  const selectedExample = examples.find(ex => ex.id === selectedExampleId) || examples[0];

  // 4) connect once
  useEffect(() => {
    const url = window.location.origin
      .replace(/^http/, 'ws')
      + '/ws'
    const s = new WebSocket(url)
    s.onopen = () => console.log('WS open')
    s.onerror = e => {
      console.error('WS err', e)
      toast.error('WebSocket error')
    }
    s.onmessage = msg => {
      const m = JSON.parse(msg.data) as TraceEvent
      if (m.type === 'STORY_LIST') {
        setEvents(m.payload)
        setErrorMsg(null)
        setIdx(0)
        setIsRunning(false)
      } else if (m.type === 'EVENT_LIST') {
        // backward compatibility: treat as story
        setEvents(m.payload)
        setErrorMsg(null)
        setIdx(0)
        setIsRunning(false)
      } else if (m.type === 'EXECUTION_ERROR') {
        setErrorMsg(m.payload.message)
        toast.error(m.payload.message)
        // Also display error in console pane
        consoleRef.current?.append(`Error: ${m.payload.message}`)
        setEvents([])
        setIdx(0)
        setIsRunning(false)
      }
    }
    s.onclose = () => console.log('WS closed')
    setWs(s)
    return () => { s.close() }
  }, [])

  // 5) send RUN and STOP, and handle example change
  const [isRunning, setIsRunning] = useState(false);

  const run = () => {
    if (!ws || ws.readyState !== 1) return
    setIsRunning(true);
    setEvents([]); setErrorMsg(null); setIdx(0)
    ws.send(JSON.stringify({ type: 'RUN_CODE', payload: { code: codeInput } }))
  }
  const stop = () => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'STOP' }))
    setIsRunning(false);
    setIdx(0); setEvents([]); setErrorMsg(null);
    resetAll(); // Also reset panes
  }

  // Handle example selection change
  const handleExampleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    const newExample = examples.find(ex => ex.id === newId);
    if (newExample) {
      stop(); // Reset any ongoing execution/story
      setSelectedExampleId(newId);
      setCodeInput(newExample.code);
      // Reset visualization state immediately
      setEvents([]);
      setErrorMsg(null);
      setIdx(0);
      resetAll();
    }
  };

  // refs for pane controls
  const codeRef = useRef<CodeViewerHandle>(null)
  const consoleRef = useRef<ConsolePaneHandle>(null)
  const callStackRef = useRef<CallStackPaneHandle>(null)
  const globalRef = useRef<GlobalScopePaneHandle>(null)

  // 3) step controls
  const isFirst = idx <= 0
  const isLast = idx >= events.length

  // --- Imperative next/prev/reset handlers ---
  const resetAll = () => {
    codeRef.current?.reset()
    consoleRef.current?.reset()
    callStackRef.current?.reset()
    globalRef.current?.reset()
    // Reset hover context state
    setCurrentGlobals({})
    setCurrentFrames([])
  }
  // Use useCallback for replayTo as it's used in effects/handlers
  const replayTo = useCallback((n: number) => {
    resetAll()
    let lastGlobals: Record<string, any> = {}
    for (let i = 0; i < n && i < events.length; i++) {
      const ev = events[i]
      switch (ev.type) {
        case 'STEP_LINE':
          // codeRef.current?.highlightLine(ev.payload.line); // REMOVE: handled by highlights prop
          // Update global pane and store last known globals
          lastGlobals = ev.payload.globals || {};
          globalRef.current?.setAllGlobals(lastGlobals);
          break;
        case 'CALL':
          // Pass funcName, args, and initial locals (parameters) to pushFrame
          callStackRef.current?.pushFrame(ev.payload.funcName, ev.payload.args, ev.payload.locals || {});
          break;
        case 'RETURN':
          callStackRef.current?.popFrame();
          // TODO: Potentially update locals of the parent frame if needed
          break;
        case 'ASSIGN':
          // No longer update globalRef here; STEP_LINE handles the snapshot
          // We might use ev.payload.isGlobal later for local variable display
          break;
        case 'CONSOLE':
          consoleRef.current?.append(ev.payload.text);
          break;
        default: break
      }
    }
    // After replaying, update the state for hover context
    setCurrentGlobals(lastGlobals)
    setCurrentFrames(callStackRef.current?.getFrames() || [])
    setIdx(n)
  }, [events]) // Dependency: events array

  const handleNext = () => {
    if (isLast) return;
    replayTo(idx + 1)
  }
  const handlePrev = () => {
    if (isFirst) return;
    replayTo(idx - 1)
  }
  const handleReset = () => replayTo(0)

  // Step Over: advance past the matching RETURN if on a CALL, otherwise next
  const handleStepOver = () => {
    if (isLast) return;
    let level = 0
    let j = idx
    if (events[j]?.type === 'CALL') {
      level = 1
      j++
      while (j < events.length && level > 0) {
        if (events[j].type === 'CALL') level++
        if (events[j].type === 'RETURN') level--
        j++
      }
    } else {
      j = idx + 1
    }
    replayTo(j)
  }

  // Step Out: run until exiting current call frame
  const handleStepOut = () => {
    if (isLast) return;
    let level = 0
    let j = idx + 1
    while (j < events.length) {
      if (events[j].type === 'CALL') level++
      if (events[j].type === 'RETURN') {
        if (level === 0) {
          j++
          break
        }
        level--
      }
      j++
    }
    replayTo(j)
  }

  // Find the current narrative hint
  const currentHint = showHints
    ? selectedExample.narrative?.find(n => n.step === idx + 1)?.text // Narrative steps are 1-based
    : null;

  return (
    <div className="space-y-6 relative">
      {/* A) Example Selector, Code input & Run/Reset */}
      <div className="space-y-4">
        {/* Example Selector */}
        <div className="flex items-center gap-4">
          <label htmlFor="example-select" className="block text-sm font-medium text-gray-700">
            Select Example:
          </label>
          <select
            id="example-select"
            value={selectedExampleId}
            onChange={handleExampleChange}
            disabled={events.length > 0 || isRunning} // Disable if running or has results
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:opacity-70"
          >
            {examples.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.title}</option>
            ))}
          </select>
          {/* Hints Toggle */}
          <div className="flex items-center">
            <input
              id="show-hints"
              type="checkbox"
              checked={showHints}
              onChange={(e) => setShowHints(e.target.checked)}
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="show-hints" className="ml-2 block text-sm text-gray-900">
              Show Hints
            </label>
          </div>
        </div>

        {/* Code Input */}
        <textarea
          className="w-full h-32 p-2 border rounded font-mono text-sm bg-gray-50"
          value={codeInput}
          // Allow editing only if no events are loaded
          onChange={e => { if (events.length === 0) setCodeInput(e.target.value) }}
          readOnly={events.length > 0}
        />
        {/* Run/Reset Buttons */}
        <div className="flex gap-2">
          <button
            onClick={run}
            disabled={isRunning || events.length > 0}
            className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
          >{isRunning ? 'Running…' : 'Run'}</button>
          <button
            onClick={stop}
            className="px-4 py-2 bg-red-500 text-white rounded"
          >Reset</button>
        </div>
        {errorMsg && <div className="text-red-700">{errorMsg}</div>}
        {/* Visual code viewer below - pass context for hover */}
        <div className="pt-4">
          <CodeViewer
            code={codeInput}
            ref={codeRef}
            globals={currentGlobals}
            frames={currentFrames}
            highlights={
              // Compute highlights for the current step
              (() => {
                const highlights: { line: number; type: "current" | "return" | "call" }[] = [];
                if (events[idx - 1]) {
                  const ev = events[idx - 1];
                  if (ev.type === 'STEP_LINE') {
                    highlights.push({ line: ev.payload.line, type: 'current' as const });
                  }
                  if (ev.type === 'RETURN' && ev.payload?.returnLine) {
                    highlights.push({ line: ev.payload.returnLine, type: 'return' as const });
                  }
                  // Add more highlight logic as needed (e.g., for CALL)
                }
                return highlights;
              })()
            }
          />
        </div>
      </div>

      {/* B) Stepper Controls */}
      <Controls
        onNextStep={handleNext}
        onPrevStep={handlePrev}
        onStepOver={handleStepOver}
        onStepOut={handleStepOut}
        onReset={handleReset}
        isFirstStep={isFirst}
        isLastStep={isLast}
        currentStepDescription={events[idx]?.type || ''}
        currentStepNumber={idx}
        totalSteps={events.length}
      />

      {/* C) Visualization Panels & Narrative */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
        {/* Left Column: Console & Narrative */}
        <div className="space-y-4 relative">
          <ConsolePane ref={consoleRef} />
          {/* Narrative Hint Display */}
          {showHints && selectedExample.narrative && (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded-md shadow">
              <h4 className="font-bold">Hint (Step {idx + 1})</h4>
              <p className="text-sm mt-1">{currentHint || (idx >= events.length ? "Execution finished." : "...")}</p>
            </div>
          )}
        </div>
        {/* Right Column: Stack, Globals, Legend */}
        <div className="space-y-4 relative">
          <CallStackPanel ref={callStackRef} />
          <GlobalScopePane ref={globalRef} />
          <Legend />
        </div>
      </div>
    </div>
  )
}
