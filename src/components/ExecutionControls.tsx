// src/components/ExecutionControls.tsx
import { usePlaybackStore } from "../store/playbackStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  CornerDownRight,
  CornerDownLeft,
  CornerUpLeft,
} from "lucide-react";

export default function ExecutionControls() {
  const {
    idx,
    events,
    isPlaying,
    speed,
    togglePlay,
    setSpeed,
    replayTo,
    stepOver,
    stepInto,
    stepOut,
  } = usePlaybackStore();

  const totalSteps = events.length;
  const canStepBack = idx > 0;
  const canStepForward = idx < totalSteps;
  const canPlay = totalSteps > 0;

  return (
    <Card className="p-4">
      <div className="flex flex-col space-y-4">
        {/* Playback Controls */}
        <div className="flex items-center justify-center space-x-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => replayTo(0)}
                  disabled={!canStepBack}
                  aria-label="Reset"
                >
                  <SkipBack size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => replayTo(idx - 1)}
                  disabled={!canStepBack}
                  aria-label="Previous Step"
                >
                  <StepBack size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Step Back</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="icon"
                  onClick={togglePlay}
                  disabled={!canPlay}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isPlaying ? "Pause" : "Play"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => replayTo(idx + 1)}
                  disabled={!canStepForward}
                  aria-label="Next Step"
                >
                  <StepForward size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Step Forward</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => replayTo(totalSteps)}
                  disabled={!canStepForward}
                  aria-label="Go to End"
                >
                  <SkipForward size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Go to End</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Debugging Controls */}
        <div className="flex items-center justify-center space-x-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stepOver}
                  disabled={!canStepForward}
                >
                  <CornerDownRight size={16} className="mr-1" />
                  Step Over
                </Button>
              </TooltipTrigger>
              <TooltipContent>Step Over</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stepInto}
                  disabled={!canStepForward}
                >
                  <CornerDownLeft size={16} className="mr-1" />
                  Step Into
                </Button>
              </TooltipTrigger>
              <TooltipContent>Step Into</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stepOut}
                  disabled={!canStepBack}
                >
                  <CornerUpLeft size={16} className="mr-1" />
                  Step Out
                </Button>
              </TooltipTrigger>
              <TooltipContent>Step Out</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Speed Control */}
        <div className="flex items-center space-x-3 justify-center">
          <span className="text-sm font-medium">Speed: {speed.toFixed(1)}x</span>
          <Slider
            min={0.1}
            max={5}
            step={0.1}
            value={[speed]}
            onValueChange={([val]) => setSpeed(val)}
            className="w-[150px]"
            disabled={!canPlay}
          />
        </div>

        {/* Progress Indicator */}
        <div className="text-center text-sm text-gray-600">
          Step {idx} of {totalSteps}
        </div>
      </div>
    </Card>
  );
}
