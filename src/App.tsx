// src/App.tsx
import { useEffect, useRef, useState } from 'react'
import { Toaster, toast } from 'sonner'

import { CodeViewer, CodeViewerHandle } from './components/CodeViewer'
import { ConsolePane, ConsolePaneHandle } from './components/ConsolePane'
import { CallStackPanel, CallStackPaneHandle } from './components/CallStackPanel'
import { GlobalScopePane, GlobalScopePaneHandle } from './components/GlobalScopePane'
import { Controls } from './components/Controls'
import { Legend } from './components/Legend'

type EventPayload = any

interface TraceEvent {
  type: string
  payload: EventPayload
}

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

  // 2) playhead index
  const [idx, setIdx] = useState(0)

  // 3) code input
  const [codeInput, setCodeInput] = useState(`// Edit & run
function hello(name) {
  console.log("Hello, " + name)
}
hello("World")`)

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

  // 5) send RUN and STOP
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
    setIdx(0); setEvents([]); setErrorMsg(null)
  }

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
  }
  const replayTo = (n: number) => {
    resetAll()
    for (let i = 0; i < n && i < events.length; i++) {
      const ev = events[i]
      switch (ev.type) {
        case 'STEP_LINE': codeRef.current?.highlightLine(ev.payload.line); break
        case 'CALL': callStackRef.current?.pushFrame(ev.payload.funcName, ev.payload.args); break
        case 'RETURN': callStackRef.current?.popFrame(); break
        case 'ASSIGN': globalRef.current?.setGlobal(ev.payload.varName, ev.payload.newValue); break
        case 'CONSOLE': consoleRef.current?.append(ev.payload.text); break
        default: break
      }
    }
    setIdx(n)
  }
  const handleNext = () => !isLast && replayTo(idx + 1)
  const handlePrev = () => !isFirst && replayTo(idx - 1)
  const handleReset = () => replayTo(0)

  return (
    <div className="space-y-6 relative">
      {/* A) Code input & Run/Reset */}
      <div className="space-y-2">
        <textarea
          className="w-full h-32 p-2 border rounded font-mono text-sm"
          value={codeInput}
          onChange={e => setCodeInput(e.target.value)}
          disabled={events.length > 0}
        />
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
      </div>

      {/* B) Stepper Controls */}
      <Controls
        onNextStep={handleNext}
        onPrevStep={handlePrev}
        onStepOver={handlePrev /* or specialized handleStepOver? adjust if implemented */}
        onStepOut={handlePrev /* or specialized handleStepOut? implement if needed */}
        onReset={handleReset}
        isFirstStep={isFirst}
        isLastStep={isLast}
        currentStepDescription={events[idx]?.type || ''}
        currentStepNumber={idx}
        totalSteps={events.length}
      />

      {/* C) Visualization Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
        <div className="space-y-4 relative">
          <ConsolePane ref={consoleRef} />
        </div>
        <div className="space-y-4 relative">
          <CallStackPanel ref={callStackRef} />
          <GlobalScopePane ref={globalRef} />
          <Legend />
        </div>
      </div>
    </div>
  )
}
