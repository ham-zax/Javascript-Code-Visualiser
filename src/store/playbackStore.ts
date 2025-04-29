import { create, StateCreator } from 'zustand'

// --- Enhanced TypeScript interfaces for backend STORY_LIST schema ---

export interface VariableInfo {
  value: any;        // Serialized variable value
  type?: string;     // e.g., 'number', 'string', 'function'
}

export interface ScopeInfo {
  scopeId: string;
  type: 'global' | 'function' | 'closure' | 'block' | string;
  name: string;
  variables: Record<string, VariableInfo>;
  parentId: string | null;
  isPersistent?: boolean;
  thisBinding?: any;
}

export interface StepLinePayload {
  line: number;
  col: number;
  snippet: string;
  scopes: ScopeInfo[];
  statementType?: string;
}

export interface CallPayload {
  funcName: string;
  args: any[];
  callSiteLine: number | null;
  newScopeId: string;
  closureScopeId?: string | null;
  thisBinding?: any;
}

export interface ReturnPayload {
  funcName: string;
  returnValue: any;
  returnLine: number | null;
  exitingScopeId: string;
}

export interface AssignPayload {
  varName: string;
  newValue: any;
  valueType?: string;
  scopeId: string;
  line?: number;
}

export interface ConsolePayload {
  text: string;
}

export type EventType = 'STEP_LINE' | 'CALL' | 'RETURN' | 'ASSIGN' | 'CONSOLE';

export interface TraceEvent {
  type: EventType;
  payload:
    | StepLinePayload
    | CallPayload
    | ReturnPayload
    | AssignPayload
    | ConsolePayload;
}

interface PlaybackState {
  events: TraceEvent[];
  currentEventIndex: number; // Renamed from idx
  isPlaying: boolean;
  speed: number;
  setEvents: (events: TraceEvent[]) => void;
  setIdx: (idx: number) => void; // Keep internal setter name for now, or rename if preferred
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  replayTo: (targetIdx: number) => void;
  stepInto: () => void;
  stepOver: () => void;
  stepOut: () => void;
}

type PlaybackStateCreator = StateCreator<PlaybackState>

const playbackStateCreator: PlaybackStateCreator = (set, get) => ({
  events: [],
  currentEventIndex: 0, // Renamed from idx
  isPlaying: false,
  speed: 1,
  setEvents: (events: TraceEvent[]) => set({ events, currentEventIndex: 0 }), // Renamed from idx
  setIdx: (idx: number) => set({ currentEventIndex: idx }), // Renamed from idx
  togglePlay: () => set({ isPlaying: !get().isPlaying }),
  setSpeed: (speed: number) => set({ speed }),
  replayTo: (targetIdx: number) => {
    const { events } = get()
    // Allow setting index to events.length (end state)
    if (targetIdx < 0 || targetIdx > events.length) return
    set({ currentEventIndex: targetIdx, isPlaying: false }) // Renamed from idx
  },

  stepInto: () => {
    // Placeholder for stepInto logic
    console.warn("ACTION: stepInto triggered (Not Implemented)");
    const { currentEventIndex, events, replayTo } = get(); // Renamed from idx
    if (currentEventIndex < events.length) {
      replayTo(currentEventIndex + 1); // Renamed from idx
    }
  },

  stepOver: () => {
    const { events, currentEventIndex, replayTo } = get() // Renamed from idx
    let level = 0
    let j = currentEventIndex // Renamed from idx
    if (j < events.length && events[j]?.type === 'CALL') {
      level = 1
      j++
      while (j < events.length && level > 0) {
        if (events[j].type === 'CALL') level++
        if (events[j].type === 'RETURN') level--
        j++
      }
    } else {
      j = Math.min(currentEventIndex + 1, events.length) // Move to next or end // Renamed from idx
    }
    replayTo(j) // Use replayTo to update index and stop playback
  },

  stepOut: () => {
    const { events, currentEventIndex, replayTo } = get() // Renamed from idx
    let level = 0
    let j = currentEventIndex + 1 // Start checking from the *next* event // Renamed from idx
    while (j < events.length) {
      if (events[j].type === 'CALL') level++
      if (events[j].type === 'RETURN') {
        if (level === 0) {
          j++ // Move past the RETURN event
          break
        }
        level--
      }
      j++
    }
    // If loop finishes without breaking, j will be events.length
    replayTo(j) // Use replayTo to update index and stop playback
  },
})

export const usePlaybackStore = create<PlaybackState>(playbackStateCreator)
