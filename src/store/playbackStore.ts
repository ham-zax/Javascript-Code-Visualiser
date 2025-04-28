import { create, StateCreator } from 'zustand'

export interface TraceEvent {
  type: string
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
    if (targetIdx < 0 || targetIdx >= events.length) return
    set({ idx: targetIdx, isPlaying: false })
  },
})

export const usePlaybackStore = create<PlaybackState>(playbackStateCreator)