// src/components/Controls.tsx
    import React from 'react';

    interface ControlsProps {
      onNextStep: () => void;
      onPrevStep: () => void; // Add previous step handler
      onReset: () => void;    // Add reset handler
      isFirstStep: boolean; // Flag for first step
      isLastStep: boolean;
      currentStepDescription: string;
      currentStepNumber: number; // Current step number
      totalSteps: number;        // Total steps
    }

    export const Controls: React.FC<ControlsProps> = ({
      onNextStep,
      onPrevStep,
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
               className={`px-6 py-2 rounded font-semibold text-white text-sm ${
                 isFirstStep
                   ? 'bg-gray-400 cursor-not-allowed'
                   : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
               }`}
             >
               Previous
             </button>
             <button
               onClick={onNextStep}
               disabled={isLastStep}
               className={`px-6 py-2 rounded font-semibold text-white text-sm ${
                 isLastStep
                   ? 'bg-gray-400 cursor-not-allowed'
                   : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
               }`}
             >
               Next
             </button>
           </div>
        </div>
      );
    };
