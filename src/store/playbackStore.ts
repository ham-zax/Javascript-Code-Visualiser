import { create, StateCreator } from 'zustand'

// Define specific event types based on backend schema
export type EventType = 'STEP_LINE' | 'CALL' | 'RETURN' | 'ASSIGN' | 'CONSOLE' | string; // Allow string for flexibility if needed

export interface TraceEvent {
  type: EventType // Use the specific EventType union
  payload: any
}

interface PlaybackState {
  events: TraceEvent[]
  idx: number
  isPlaying: boolean
  speed: number
  setEvents: (events: TraceEvent[]) => void
  setIdx: (idx: number) => void
  togglePlay: () => void
  setSpeed: (speed: number) => void
  replayTo: (targetIdx: number) => void
  stepOver: () => void // Add stepOver action
  stepOut: () => void // Add stepOut action
}

type PlaybackStateCreator = StateCreator<PlaybackState>

const playbackStateCreator: PlaybackStateCreator = (set, get) => ({
  events: [],
  idx: 0,
  isPlaying: false,
  speed: 1,
  setEvents: (events: TraceEvent[]) => set({ events, idx: 0 }),
  setIdx: (idx: number) => set({ idx }),
  togglePlay: () => set({ isPlaying: !get().isPlaying }),
  setSpeed: (speed: number) => set({ speed }),
  replayTo: (targetIdx: number) => {
    const { events } = get()
    // Allow setting index to events.length (end state)
    if (targetIdx < 0 || targetIdx > events.length) return
    set({ idx: targetIdx, isPlaying: false })
  },

  stepOver: () => {
    const { events, idx, replayTo } = get()
    let level = 0
    let j = idx
    if (j < events.length && events[j]?.type === 'CALL') {
      level = 1
      j++
      while (j < events.length && level > 0) {
        if (events[j].type === 'CALL') level++
        if (events[j].type === 'RETURN') level--
        j++
      }
    } else {
      j = Math.min(idx + 1, events.length) // Move to next or end
    }
    replayTo(j) // Use replayTo to update index and stop playback
  },

  stepOut: () => {
    const { events, idx, replayTo } = get()
    let level = 0
    let j = idx + 1 // Start checking from the *next* event
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