// src/App.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Toaster, toast } from 'sonner'
import Xarrow from 'react-xarrows';

import { CodeDisplay } from './components/CodeDisplay'
import { CallStackPanel } from './components/CallStackPanel'
import { ScopePanel } from './components/ScopePanel'
import { Controls } from './components/Controls'
import { Legend } from './components/Legend'
import { OutputPanel } from './components/OutputPanel'

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
  // 1) WebSocket & raw events
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [events, setEvents] = useState<TraceEvent[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 2) playhead
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
      if (m.type === 'EVENT_LIST') {
        setEvents(m.payload)
        setErrorMsg(null)
        setIdx(0)
      } else if (m.type === 'EXECUTION_ERROR') {
        setErrorMsg(m.payload.message)
        toast.error(m.payload.message)
        setEvents([])
        setIdx(0)
      }
    }
    s.onclose = () => console.log('WS closed')
    setWs(s)
    return () => { s.close() }
  }, [])

  // 5) send RUN and STOP
  const run = () => {
    if (!ws || ws.readyState !== 1) return
    setEvents([]); setErrorMsg(null); setIdx(0)
    ws.send(JSON.stringify({ type: 'RUN_CODE', payload: { code: codeInput } }))
  }
  const stop = () => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'STOP' }))
    setIdx(0); setEvents([]); setErrorMsg(null)
  }

  // 6) derive a “snapshot” by replaying events[0..idx]
  const snapshot = useMemo(() => {
    // defaults
    let highlightedLines: number[] = []
    let callStack: { id: string, functionName: string, localScope: any }[] = [
      { id: 'global', functionName: '(global)', localScope: {} }
    ]
    let globalScope: Record<string, any> = {}
    let closures: Record<string, any> = {}
    let output: string[] = []

    // replay
    for (let i = 0; i <= idx && i < events.length; i++) {
      const ev = events[i]
      switch (ev.type) {
        case 'Step':
          highlightedLines = [ev.payload.line]
          break

        case 'EnterFunction':
          callStack.push({
            id: String(ev.payload.id),
            functionName: ev.payload.name,
            localScope: {}
          })
          break

        case 'ExitFunction':
          callStack.pop()
          break

        case 'Locals':
          // assign locals into top frame
          callStack[callStack.length - 1].localScope = ev.payload
          break

        case 'Closure':
          closures[String(ev.payload.fnId)] = ev.payload
          break

        case 'ConsoleLog':
          output.push(ev.payload.message)
          break

        // you could handle VarWrite here to fill globalScope,
        // or VarRead if you really want to show reads.
        default:
          break
      }
    }

    // pick up closure for top frame if any
    const top = callStack[callStack.length - 1]
    const capturedScope = closures[top.id]?.[1] === undefined
      ? closures[top.id]?.[1] // if you passed [fnId, bindings]
      : closures[top.id]?.payload
    const closureSourceName = top.functionName

    return {
      highlightedLines,
      codeLines: codeInput.split('\n'),
      callStack,
      globalScope,
      currentContext: top,
      capturedScope,
      closureSourceName,
      output
    }
  }, [events, idx, codeInput])

  // 7) step controls
  const isFirst = idx <= 0
  const isLast = idx >= events.length - 1

  // --- ARROW REFS ---
  const codeLineRef = useRef<HTMLDivElement>(null);
  const topFrameRef = useRef<HTMLLIElement>(null);

  // --- IDs for Xarrow (fallback if needed) ---
  // const codeLineId = 'active-code-line';
  // const topFrameId = 'top-stack-frame';

  return (
    <div className="space-y-6 relative">
      {/* A) Editor + Run/Stop */}
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
            disabled={events.length > 0}
            className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
          >Run</button>
          <button
            onClick={stop}
            className="px-4 py-2 bg-red-500 text-white rounded"
          >Reset</button>
        </div>
        {errorMsg && <div className="text-red-700">{errorMsg}</div>}
      </div>

      {/* B) Controls Bar */}
      <Controls
        onPrevStep={() => setIdx(i => Math.max(0, i - 1))}
        onNextStep={() => setIdx(i => Math.min(events.length - 1, i + 1))}
        onReset={() => setIdx(0)}
        isFirstStep={isFirst}
        isLastStep={isLast}
        currentStepDescription={
          events[idx]?.type === 'Step'
            ? events[idx].payload.snippet
            : events[idx]?.type || ''
        }
        currentStepNumber={idx}
        totalSteps={events.length}
      />

      {/* C) Visualization Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
        <div className="space-y-4 relative">
          <CodeDisplay
            codeLines={snapshot.codeLines}
            highlightedLines={snapshot.highlightedLines}
            activeLineRef={codeLineRef}
          />
          <OutputPanel output={snapshot.output} />
        </div>
        <div className="space-y-4 relative">
          <CallStackPanel callStack={snapshot.callStack} topFrameRef={topFrameRef} />
          <ScopePanel
            globalScope={snapshot.globalScope}
            currentContext={{
              ...snapshot.currentContext,
              // adapt shape if needed
            }}
            capturedScope={snapshot.capturedScope || null}
            closureSourceContextName={snapshot.closureSourceName}
          />
          <Legend />
        </div>
        {/* SVG Arrow overlay */}
        {snapshot.highlightedLines.length > 0 && snapshot.callStack.length > 0 && (
          <Xarrow
            start={codeLineRef}
            end={topFrameRef}
            color="#facc15"
            strokeWidth={3}
            headSize={6}
            zIndex={1000}
            showHead={true}
            showTail={false}
            path="smooth"
            curveness={0.5}
          />
        )}
      </div>
    </div>
  )
}
