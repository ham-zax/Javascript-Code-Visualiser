// src/components/Controls.tsx
import React from 'react';

interface ControlsProps {
  onNextStep: () => void;
  onPrevStep: () => void;
  onStepOver: () => void;
  onStepOut: () => void;
  onReset: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  currentStepDescription: string;
  currentStepNumber: number;
  totalSteps: number;
}

export const Controls: React.FC<ControlsProps> = ({
  onNextStep,
  onPrevStep,
  onStepOver,
  onStepOut,
  onReset,
  isFirstStep,
  isLastStep,
  currentStepDescription,
  currentStepNumber,
  totalSteps
}) => {
  return (
    <div className="bg-white p-4 rounded-md shadow flex flex-col sm:flex-row items-center justify-between gap-4">
       <div className="flex-1 text-center sm:text-left">
         <p className="text-sm text-gray-600">
           <span className="font-semibold">Step {currentStepNumber} / {totalSteps}:</span> {currentStepDescription}
         </p>
       </div>
       <div className="flex items-center gap-2 flex-shrink-0">
         <button
            onClick={onReset}
            className={`px-4 py-2 rounded font-semibold text-sm text-white bg-gray-500 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed`}
            disabled={isFirstStep} // Disable reset if already at step 0
         >
            Reset
         </button>
         <button
           onClick={onPrevStep}
           disabled={isFirstStep}
           className={`px-4 py-2 rounded font-semibold text-white text-sm ${
             isFirstStep
               ? 'bg-gray-400 cursor-not-allowed'
               : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
           }`}
         >Previous</button>
         <button
           onClick={onStepOver}
           disabled={isLastStep}
           className="px-4 py-2 rounded bg-green-600 text-white text-sm hover:bg-green-700"
         >Step Over</button>
         <button
           onClick={onStepOut}
           disabled={isLastStep}
           className="px-4 py-2 rounded bg-yellow-600 text-white text-sm hover:bg-yellow-700"
         >Step Out</button>
         <button
           onClick={onNextStep}
           disabled={isLastStep}
           className={`px-4 py-2 rounded font-semibold text-white text-sm ${
             isLastStep
               ? 'bg-gray-400 cursor-not-allowed'
               : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
           }`}
         >Next</button>
       </div>
    </div>
  );
};
