// src/App.tsx
import { useEffect, useRef, useState } from 'react'
import { Toaster, toast } from 'sonner'
// Import necessary actions from the store
import { usePlaybackStore, TraceEvent } from './store/playbackStore'

import { CodeViewer, CodeViewerHandle } from './components/CodeViewer'
import { ConsolePane, ConsolePaneHandle } from './components/ConsolePane'
import {
  CallStackPanel,
  CallStackPaneHandle,
} from './components/CallStackPanel'
import {
  GlobalScopePane,
  GlobalScopePaneHandle
} from './components/GlobalScopePane'
import { Controls } from './components/Controls'
import { Legend } from './components/Legend'

import './App.css'

// Helper function to get WebSocket URL
const url = (path: string) => window.location.origin.replace(/^http/, 'ws') + path;

export default function App() {
  // WebSocket state
  const [ws, setWs] = useState<WebSocket | null>(null)
  // Get state and actions from the store
  const { events, idx, setEvents, replayTo, isPlaying, setIdx, speed } = usePlaybackStore()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Local state for UI updates derived from store state
  const [currentCode, setCurrentCode] = useState('') // Keep track of the code being run
  // Remove local state for globals and frames, they will be managed by the replay effect
  // const [currentGlobals, setCurrentGlobals] = useState<Record<string, any>>({})
  // const [currentFrames, setCurrentFrames] = useState<Frame[]>([])

  // refs for the panes
  const codeRef = useRef<CodeViewerHandle>(null)
  const consoleRef = useRef<ConsolePaneHandle>(null)
  const callStackRef = useRef<CallStackPaneHandle>(null)
  const globalRef = useRef<GlobalScopePaneHandle>(null)

  // open WS once
  useEffect(() => {
    const socket = new WebSocket(url('/ws'))
    setWs(socket) // Set the WebSocket instance

    socket.onopen = () => console.log('WS connected')
    socket.onerror = (e) => {
      console.error('WS error', e)
      toast.error('WebSocket connection error')
    }
    socket.onmessage = (evt) => {
      const msg = JSON.parse(evt.data)
      // Add console log to verify received messages
      console.log('WS ▶︎', msg.type, msg.payload)
      // Use backend event types
      if (msg.type === 'STORY_LIST') { // Changed from EVENT_LIST based on backend
        setErrorMsg(null)
        setEvents(msg.payload as TraceEvent[]) // Ensure payload matches TraceEvent[]
        // Set current code from the input when story arrives
        const codeInput = document.getElementById('code-input') as HTMLTextAreaElement;
        if (codeInput) {
          setCurrentCode(codeInput.value);
        }
        replayTo(0) // Reset playback to the beginning
      } else if (msg.type === 'EXECUTION_ERROR') {
        setErrorMsg(msg.payload.message)
        toast.error(`Execution Error: ${msg.payload.message}`)
        consoleRef.current?.append(`Error: ${msg.payload.message}`)
        setEvents([]) // Clear events on error
        replayTo(0) // Reset index
        // Optionally clear code viewer or show error state
        codeRef.current?.reset();
        callStackRef.current?.reset();
        globalRef.current?.reset();
        consoleRef.current?.reset(); // Also reset console
        setCurrentCode(''); // Clear the code associated with the error
      }
    }
    socket.onclose = () => console.log('WS closed')

    return () => {
      socket.close()
    }
  // Add replayTo to dependencies
  }, [setEvents, replayTo])

  // reset all panes (UI only) - This might be redundant if replay effect handles reset
  const resetAllPanes = () => {
    codeRef.current?.reset()
    consoleRef.current?.reset()
    callStackRef.current?.reset()
    globalRef.current?.reset()
    // No need to manage local globals/frames state here anymore
  }

  // Effect to update UI based on store's idx and events (Replay Logic)
  useEffect(() => {
    // Reset everything
    codeRef.current?.reset()
    consoleRef.current?.reset()
    callStackRef.current?.reset()
    globalRef.current?.reset()

    // Replay up to current index
    let lastGlobals: Record<string, any> = {}

    for (let i = 0; i < idx && i < events.length; i++) {
      const ev = events[i]
      switch (ev.type) {
        case 'STEP_LINE':
          // Highlight code and snapshot globals
          codeRef.current?.setHighlights([{ line: ev.payload.line, type: 'current' }])
          lastGlobals = ev.payload.globals || {}
          globalRef.current?.setAllGlobals(lastGlobals)
          break

        case 'CALL':
          callStackRef.current?.pushFrame(
            ev.payload.funcName,
            ev.payload.args,
            ev.payload.locals || {}
          )
          break

        case 'RETURN':
          callStackRef.current?.popFrame()
          break

        case 'ASSIGN':
          // Only update if it's a global write
          if (ev.payload.isGlobal) {
            // Use varName and newValue based on typical schema
            const varName = ev.payload.varName || ev.payload.name;
            const newValue = ev.payload.newValue !== undefined ? ev.payload.newValue : ev.payload.value;
            if (varName !== undefined) { // Ensure varName exists
                 lastGlobals = { ...lastGlobals, [varName]: newValue };
                 globalRef.current?.setAllGlobals(lastGlobals);
            }
          } else {
             // Optionally handle local updates if needed, though globals are primary here
             // Example: Update locals in the current frame if CallStackPanel supports it
             const varName = ev.payload.varName || ev.payload.name;
             const newValue = ev.payload.newValue !== undefined ? ev.payload.newValue : ev.payload.value;
             if (varName !== undefined) {
                 callStackRef.current?.updateCurrentFrameLocals({ [varName]: newValue });
             }
          }
          break

        case 'CONSOLE':
          // Use the correct payload field (e.g., text or args)
          const message = Array.isArray(ev.payload.args) ? ev.payload.args.map((arg: any) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ') : String(ev.payload.text || '');
          consoleRef.current?.append(message)
          break

        default:
          // Optional: Log unknown event types
          // console.log("Unknown event type:", ev.type);
          break
      }
    }

    // After the loop, ensure the highlight reflects the *next* step (at idx)
    // or the last step if idx is at the end.
    if (idx < events.length) {
        const currentEvent = events[idx];
        if (currentEvent?.type === 'STEP_LINE') {
            codeRef.current?.setHighlights([{ line: currentEvent.payload.line, type: 'current' }]);
            // Also ensure globals reflect the state *at* this step
            globalRef.current?.setAllGlobals(currentEvent.payload.globals || lastGlobals);
        }
        // If the current event is not STEP_LINE, the highlight from the loop (last STEP_LINE) remains.
    } else if (idx === events.length && events.length > 0) {
        // If at the end, keep the highlight on the last executed STEP_LINE
        // The loop already set this highlight.
        // Ensure final global state is shown
        globalRef.current?.setAllGlobals(lastGlobals);
    }

  }, [idx, events]) // Dependencies remain the same

  // Auto-play effect
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (isPlaying && idx < events.length) {
      timer = setTimeout(() => {
        setIdx(idx + 1);
      }, 1000 / speed); // Use speed from store
    }
    return () => clearTimeout(timer);
  }, [isPlaying, idx, events.length, speed, setIdx]);

  // handlers for the buttons
  const handleRun = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
       toast.error("WebSocket not connected.");
       return;
    }
    const codeInput = document.getElementById('code-input') as HTMLTextAreaElement;
    const code = codeInput?.value;
    if (!code) {
        toast.info("Please enter some code to run.");
        return;
    }
    setErrorMsg(null);
    // Clear previous state before running new code
    setEvents([]);
    replayTo(0);
    resetAllPanes(); // Explicitly reset panes UI
    setCurrentCode(code); // Set code for viewer immediately
    // Send RUN_CODE message to backend
    ws.send(JSON.stringify({ type: 'RUN_CODE', payload: { code } }))
  }

  // Reset button handler uses replayTo(0) from the store
  const handleReset = () => replayTo(0)


  return (
    <div className="min-h-screen p-6 bg-gray-100 space-y-6">
      {/* Code input & run/reset */}
      <div className="space-y-3">
        <textarea
          id="code-input"
          className="w-full h-28 p-2 border rounded font-mono"
          placeholder="Paste your JS here…"
          // defaultValue={currentCode} // Let state manage the value if needed, or keep as is
        />
        <div className="flex gap-2">
          <button
            onClick={handleRun}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
          >
            Run
          </button>
          <button
            onClick={handleReset} // Use store action via replayTo
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            disabled={events.length === 0 && idx === 0} // Disable if already at start
          >
            Reset
          </button>
        </div>
        {errorMsg && <p className="text-red-600 text-sm mt-2">Error: {errorMsg}</p>}
      </div>

      {/* Code viewer */}
      <div className="bg-white p-4 rounded shadow">
        <CodeViewer
          ref={codeRef}
          code={currentCode} // Pass the current code being visualized
          // Pass empty objects/arrays to satisfy prop types, as logic uses refs now
          globals={{}}
          frames={[]}
        />
      </div>

      {/* Controls - Needs wiring inside Controls.tsx */}
      <div className="bg-white p-4 rounded shadow">
        <Controls />
      </div>

      {/* Panes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <ConsolePane ref={consoleRef} />
        </div>
        <div className="space-y-4">
          {/* Pass refs to children */}
          <CallStackPanel ref={callStackRef} />
          <GlobalScopePane ref={globalRef} />
          <Legend />
        </div>
      </div>

      <Toaster position="bottom-right" />
    </div>
  )
}
