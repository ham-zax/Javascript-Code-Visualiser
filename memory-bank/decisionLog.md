# Decision Log

This file records architectural and implementation decisions using a list format.
2025-04-30 05:58:29 - Log of updates made.

*

## Decision

*

## Rationale 

*

## Implementation Details

*
[2025-04-30 05:59:44] - Renamed `_handleVarWriteEvent` to `processVarWriteEventAndUpdateScopes` in `backend/src/main/storyReducer.js` for clarity on side effects. No functional change.
[2025-04-30 06:00:48] - Extracted the logic for handling 'Locals' events from the main switch statement in `storyReducer` into a new helper function `_processLocalsEvent` for improved modularity and readability.
[2025-04-30 06:03:30] - Extracted the logic for handling 'Closure' events from the main switch statement in `storyReducer` into a new helper function `_processClosureEvent` for improved modularity and maintainability.
[2025-04-30 06:04:07] - Extracted the logic for handling 'ConsoleLog', 'ConsoleWarn', and 'ConsoleError' events from the main switch statement in `storyReducer` into a new helper function `_processConsoleEvent` for improved clarity and reduced repetition.
[2025-04-30 06:05:02] - Extracted the logic for handling 'HEAP_UPDATE' events from the main switch statement in `storyReducer` into a new helper function `_processHeapUpdateEvent` for improved modularity and clarity.
[2025-04-30 06:06:14] - Extracted the logic for handling 'Step' events from the main switch statement in `storyReducer` into a new helper function `_processStepEvent` for improved modularity and clarity.
[2025-04-30 06:08:02] - Extracted the logic for handling 'BeforeCall' events from the main switch statement in `storyReducer` into a new helper function `_processBeforeCallEvent` for improved modularity and clarity.
[2025-04-30 06:09:03] - Refactored `_processLocalsEvent` to return the determined `lexicalScopeId` instead of modifying `pendingLexicalScopeId` via closure. Updated the call site to explicitly assign the result, improving clarity of state updates in `storyReducer`.
[2025-04-30 06:10:19] - Added explanatory comments for each internal state variable in `storyReducer` to clarify their purpose and improve code readability.
[2025-04-30 06:31:24] - Implemented variable highlighting: Modified `VariableDisplay.tsx` to conditionally apply `variable-changed` class based on `hasChanged` prop. CSS rule already existed in `index.css`. Rationale: Improve step-by-step clarity by showing which variable was just modified.
[2025-04-30 06:32:12] - Implemented active frame highlighting: Modified `VisualizationState.tsx` to identify the top frame and pass `isActive` prop to `FrameNode`. Modified `FrameNode.tsx` to accept `isActive` and apply `frame-node-active` class. Added `.frame-node-active` style to `index.css`. Rationale: Clearly indicate the current execution context within the call stack.