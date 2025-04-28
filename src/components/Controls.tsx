import React from 'react';
import { usePlaybackStore } from '../store/playbackStore';

export const Controls: React.FC = () => {
  const { events, idx, isPlaying, speed, setIdx, togglePlay, setSpeed, replayTo } = usePlaybackStore();
  const isFirstStep = idx === 0;
  const isLastStep = idx === events.length - 1;
  const currentEvent = events[idx];
  const currentStepDescription = currentEvent?.type || '';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button onClick={() => setIdx(idx - 1)} disabled={isFirstStep}>Prev</button>
        <button onClick={() => setIdx(idx + 1)} disabled={isLastStep}>Next</button>
        <button onClick={() => replayTo(idx + 1)}>Step Over</button>
        <button onClick={() => replayTo(idx - 1)}>Step Out</button>
        <button onClick={() => replayTo(0)}>Reset</button>
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={() => togglePlay()}>Play</button>
        <button onClick={() => togglePlay()}>Pause</button>
        <button onClick={() => setSpeed(2)}>Set Speed</button>
        <button onClick={() => replayTo(3)}>Seek</button>
      </div>
      <div className="mt-2">
        {`Step ${idx + 1} of ${events.length} - ${currentStepDescription}`}
      </div>
    </div>
  );
};
