import { usePlaybackStore } from "../store/playbackStore"
import { Play, Pause, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react'; // Example icons

export function Controls() {
  // Get state and actions from the store
  const {
    idx,
    events,
    isPlaying,
    speed,
    togglePlay,
    setSpeed,
    replayTo,
    stepOver,
    stepOut
  } = usePlaybackStore();

  const maxIdx = events.length; // events.length represents the state *after* the last event

  return (
    <div className="flex flex-col space-y-3">
      {/* Playback Controls */}
      <div className="flex items-center justify-center space-x-2">
         <button
           onClick={() => replayTo(0)} // Go to beginning
           disabled={idx === 0}
           className="p-2 rounded-full hover:bg-gray-200 disabled:opacity-50"
           aria-label="Reset"
         >
           <SkipBack size={18} />
         </button>
        <button
          onClick={() => replayTo(idx - 1)} // Previous Step
          disabled={idx === 0}
          className="p-2 rounded-full hover:bg-gray-200 disabled:opacity-50"
          aria-label="Previous Step"
        >
          <StepBack size={18} />
        </button>
        <button
          onClick={togglePlay}
          disabled={events.length === 0}
          className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:bg-gray-400"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          onClick={() => replayTo(idx + 1)} // Next Step
          disabled={idx >= maxIdx}
          className="p-2 rounded-full hover:bg-gray-200 disabled:opacity-50"
          aria-label="Next Step"
        >
          <StepForward size={18} />
        </button>
         <button
           onClick={() => replayTo(maxIdx)} // Go to end
           disabled={idx >= maxIdx}
           className="p-2 rounded-full hover:bg-gray-200 disabled:opacity-50"
           aria-label="Go to End"
         >
           <SkipForward size={18} />
         </button>
      </div>

       {/* Step Over/Out Controls */}
       <div className="flex items-center justify-center space-x-2">
         <button
           onClick={stepOver}
           disabled={idx >= maxIdx || events.length === 0}
           className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50"
         >
           Step Over
         </button>
         <button
           onClick={stepOut}
           disabled={idx >= maxIdx || events.length === 0}
           className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50"
         >
           Step Out
         </button>
       </div>


      {/* Speed Control */}
      <div className="flex items-center space-x-2 justify-center">
        <label htmlFor="speed-slider" className="text-sm font-medium">Speed: {speed.toFixed(1)}x</label>
        <input
          type="range"
          id="speed-slider"
          min={0.1}
          max={5}
          step={0.1}
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="w-[150px] accent-blue-500" // Basic styling for range input
          disabled={events.length === 0}
        />
      </div>

      {/* Progress Indicator */}
      <div className="text-center text-sm text-gray-600">
        Step {idx} of {maxIdx}
      </div>
    </div>
  )
}
