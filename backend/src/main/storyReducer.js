const _ = require('lodash');

// Main reducer function
function storyReducer(initialState, rawEvents) {
  rawEvents = Array.isArray(rawEvents) ? rawEvents : initialState || [];
  console.log(`[storyReducer] Received raw events array (length ${rawEvents.length})`);

  const story = [];

  // --- Internal State ---
  function _initializeGlobalScope() {
    return {
      scopeId: 'global',
      type: 'global',
      name: 'global',
      variables: {},
      parentId: null,
      isPersistent: true,
      thisBinding: null
    };
  }
  // Stores the current state of all known lexical scopes (global, function, closure) by their unique lexical ID.
  const activeScopes = { 'global': _initializeGlobalScope() };
  // Tracks the current call stack using invocation IDs (temporary IDs for each function call).
  const scopeStack = ['global'];
  // Maps temporary invocation IDs (from EnterFunction) to persistent lexical scope IDs (from Locals/Closure).
  const invocationToLexicalMap = {};
  // Accumulates the state of heap-allocated objects/arrays/functions throughout execution.
  const heapSnapshot = {};
  // Tracks lexical scope IDs that are known to be closed over but whose scope object hasn't been created yet.
  const pendingPersistence = new Set();
  // Temporarily holds the lexical scope ID created by a 'Locals' event, to be associated with the next 'EnterFunction' invocation ID.
  let pendingLexicalScopeId = null;
  // Stores the line number where a function call occurred, used by the subsequent 'EnterFunction' event.
  const callSiteLineStack = [];
  // --- End Internal State ---

  // Helper to check if a variable name is internal
  function isInternalTracerVar(name) {
    return typeof name === "string" && (name.startsWith("_traceId") || name.startsWith("_callId") || name.startsWith("_tempReturnValue"));
  }

  // --- Helper Functions ---

  // Handles 'BeforeCall' events: pushes callSiteLine onto the stack
  function _processBeforeCallEvent(evt, callSiteLineStack) {
    callSiteLineStack.push(evt.payload.callSiteLine);
  }

  // Handles 'Step' events: generates STEP_LINE story event with scope and heap snapshots
  function _processStepEvent(evt, story, buildScopesSnapshot, heapSnapshot) {
    console.log(`[storyReducer] Handling Step for line ${evt.payload.line}`);
    const scopesSnapshot = buildScopesSnapshot();
    const heapSnapshotClone = _.cloneDeep(heapSnapshot);

    story.push({
      type: 'STEP_LINE',
      payload: {
        line: evt.payload.line,
        col: evt.payload.col,
        snippet: evt.payload.snippet,
        scopes: scopesSnapshot,
        heap: heapSnapshotClone,
        statementType: evt.payload.statementType
      }
    });
    console.log('[storyReducer] Pushed STEP_LINE event.');
  }

  // Handles 'HEAP_UPDATE' events: updates heapSnapshot
  function _processHeapUpdateEvent(evt, heapSnapshot) {
    const { heapId, value } = evt.payload;
    console.log(`[storyReducer] Updating heap snapshot for ID: ${heapId}`);
    heapSnapshot[heapId] = value;
  }

  // Handles console events: ConsoleLog, ConsoleWarn, ConsoleError
  function _processConsoleEvent(evt, story) {
    const text = (evt.payload.text || evt.payload.message || '').trim();
    console.log(`[storyReducer] Handling ${evt.type}: ${text}`);
    story.push({ type: 'CONSOLE', payload: { text } });
  }

  // Handles 'Closure' events: updates activeScopes and pendingPersistence
  function _processClosureEvent(evt, activeScopes, pendingPersistence) {
    const { closureId, parentId } = evt.payload;

    if (!parentId || parentId === 'unknown-no-scope' || parentId === 'unknown-missing-funcScopeId') {
      console.warn(`[storyReducer] Closure event for '${closureId}' has invalid parentId '${parentId}'! Cannot mark persistent.`);
      return;
    }

    console.log(`[storyReducer] Handling Closure event: Scope '${closureId}' closes over parent scope '${parentId}'`);
    const outerScope = activeScopes[parentId];

    if (outerScope) {
      outerScope.isPersistent = true;
      console.log(`[storyReducer] Marked outer scope '${parentId}' as persistent.`);
    } else {
      console.warn(`[storyReducer] Closure: Outer scope '${parentId}' not found yet. Adding to pendingPersistence.`);
      pendingPersistence.add(parentId);
    }
  }

  // Handles 'VarWrite' events: updates activeScopes and returns ASSIGN payload or null
  function processVarWriteEventAndUpdateScopes(evt, activeScopes, invocationToLexicalMap) { // Renamed
    const invocationScopeId = evt.payload.scopeId;
    const name = evt.payload.name;
    const val = evt.payload.val;
    const valueType = evt.payload.valueType;
    const line = evt.payload.line;

    if (isInternalTracerVar(name)) return null;

    if (!invocationScopeId) {
      console.error('[storyReducer] ERROR: VarWrite event missing scopeId!');
      return null;
    }

    const lexicalScopeIdToUpdate = invocationScopeId === 'global'
      ? 'global'
      : invocationToLexicalMap[invocationScopeId];

    if (!lexicalScopeIdToUpdate) {
      console.error(`[storyReducer] CRITICAL: VarWrite lookup failed for invocation scope ${invocationScopeId}! Cannot update variable '${name}'. Map state: ${JSON.stringify(invocationToLexicalMap)}`);
      return null;
    }

    console.log(`[storyReducer] Handling VarWrite for var '${name}' in lexical scope ${lexicalScopeIdToUpdate} (derived from invocation ${invocationScopeId})`);

    const scopeToUpdate = activeScopes[lexicalScopeIdToUpdate];
    if (!scopeToUpdate) {
      console.error(`[storyReducer] CRITICAL: VarWrite target lexical scope ${lexicalScopeIdToUpdate} not found in activeScopes! Cannot update '${name}'. Active: ${Object.keys(activeScopes)}`);
      return null;
    }

    if (!scopeToUpdate.variables) scopeToUpdate.variables = {};

    scopeToUpdate.variables[name] = { value: val, type: valueType };

    console.log(`[storyReducer] Updated variable '${name}' in lexical scope '${lexicalScopeIdToUpdate}':`, JSON.stringify(scopeToUpdate.variables[name]));

    return {
      varName: name,
      newValue: val,
      valueType: valueType,
      scopeId: invocationScopeId,
      line: line
    };
  }


  // Helper to build the scopes snapshot for STEP_LINE events
  function buildScopesSnapshot() {
    console.log(`[storyReducer] Building scope snapshot. Current invocation stack: ${scopeStack.join(',')}`);
    const visibleLexicalScopeIds = new Set();
    const scopesToProcess = [...scopeStack];

    // Helper: Process a single scope for the snapshot (now local to buildScopesSnapshot)
    function _processScopeForSnapshot(lexicalScopeId, activeScopes) {
      // findDefiningScope is now nested here for encapsulation
      function findDefiningScope(variableName, startingLexicalScopeId) {
        let currentId = startingLexicalScopeId;
        while (currentId) {
          const scope = activeScopes[currentId];
          if (scope?.variables && Object.prototype.hasOwnProperty.call(scope.variables, variableName)) {
            return currentId;
          }
          if (currentId === 'global' || !scope?.parentId) {
            break;
          }
          currentId = scope.parentId;
        }
        if (
          startingLexicalScopeId !== 'global' &&
          activeScopes['global']?.variables &&
          Object.prototype.hasOwnProperty.call(activeScopes['global'].variables, variableName)
        ) {
          return 'global';
        }
        return null;
      }

      const originalScope = activeScopes[lexicalScopeId];
      if (!originalScope) {
        console.warn(`[storyReducer] Snapshot: Lexical Scope ID ${lexicalScopeId} not found in activeScopes during final mapping!`);
        return null;
      }

      const scopeClone = _.cloneDeep(originalScope);
      if (!scopeClone) {
        console.error(`[storyReducer] Snapshot: Failed to clone scope ${lexicalScopeId}. Skipping.`);
        return null;
      }

      if (scopeClone.variables) {
        const filteredVariables = {};
        for (const varName in scopeClone.variables) {
          if (isInternalTracerVar(varName)) continue;
          const originalVarData = scopeClone.variables[varName];
          const definingScopeId = findDefiningScope(varName, lexicalScopeId);

          let bindingType = 'local';
          if (definingScopeId === 'global') {
            bindingType = 'global';
          } else if (definingScopeId && definingScopeId !== lexicalScopeId) {
            const definingScope = activeScopes[definingScopeId];
            if (definingScope?.isPersistent) {
              bindingType = 'closure';
            } else {
              bindingType = 'ancestor-non-persistent';
              console.log(`[storyReducer] Variable '${varName}' in scope '${lexicalScopeId}' defined in non-persistent ancestor '${definingScopeId}'. Type: ${bindingType}`);
            }
          } else if (!definingScopeId) {
            bindingType = 'unknown';
            console.warn(`[storyReducer] Could not find defining scope for variable '${varName}' starting from scope '${lexicalScopeId}'.`);
          }
          filteredVariables[varName] = { ...originalVarData, bindingType };
        }
        scopeClone.variables = filteredVariables;
      }
      if (scopeClone.variables && typeof scopeClone.variables === 'object' && !Array.isArray(scopeClone.variables)) {
        scopeClone.variables = Object.entries(scopeClone.variables).map(([varName, data]) => ({
          varName,
          ...data
        }));
      } else if (!scopeClone.variables) {
        scopeClone.variables = [];
      }

      return scopeClone;
    }

    while (scopesToProcess.length > 0) {
      const currentInvocationId = scopesToProcess.shift();
      if (!currentInvocationId) continue;

      const currentLexicalId = currentInvocationId === 'global' ? 'global' : invocationToLexicalMap[currentInvocationId];

      if (!currentLexicalId || visibleLexicalScopeIds.has(currentLexicalId)) {
        if (!currentLexicalId && currentInvocationId !== 'global') {
          console.warn(`[storyReducer] Snapshot: Could not find lexical mapping for invocation ID ${currentInvocationId}`);
        }
        continue;
      }

      visibleLexicalScopeIds.add(currentLexicalId);
      const scope = activeScopes[currentLexicalId];

      if (scope?.parentId && !visibleLexicalScopeIds.has(scope.parentId)) {
        scopesToProcess.push(scope.parentId);
      }
      if (scope?.closureScopeId && !visibleLexicalScopeIds.has(scope.closureScopeId)) {
        scopesToProcess.push(scope.closureScopeId);
      }
    }

    Object.keys(activeScopes).forEach(lexicalId => {
      if (activeScopes[lexicalId].isPersistent && !visibleLexicalScopeIds.has(lexicalId)) {
        visibleLexicalScopeIds.add(lexicalId);
        let parentId = activeScopes[lexicalId].parentId;
        while (parentId && !visibleLexicalScopeIds.has(parentId)) {
          visibleLexicalScopeIds.add(parentId);
          parentId = activeScopes[parentId]?.parentId;
        }
      }
    });

    const snapshot = [];
    for (const lexicalScopeId of visibleLexicalScopeIds) {
      const processedScope = _processScopeForSnapshot(lexicalScopeId, activeScopes);
      if (processedScope) {
        snapshot.push(processedScope);
      }
    }

    console.log(`[storyReducer] Built snapshot with ${snapshot.length} scopes (Lexical IDs: ${Array.from(visibleLexicalScopeIds).join(', ')})`);
    return snapshot;
  }

  // Helper to process 'Locals' event (extracted)
  function _processLocalsEvent(evt, activeScopes, pendingPersistence) {
    const lexicalScopeId = evt.payload.scopeId;
    const parentLexicalId = evt.payload.parentId;
    const locals = evt.payload.locals || {};

    if (!lexicalScopeId) {
      console.error('[storyReducer] ERROR: Locals event missing scopeId!');
      return; // Return early if no scopeId
    }
    console.log(`[storyReducer] Handling Locals for lexical scope ${lexicalScopeId}, parent ${parentLexicalId}`);

    if (!activeScopes[lexicalScopeId]) {
      activeScopes[lexicalScopeId] = {
        scopeId: lexicalScopeId,
        type: 'function',
        name: lexicalScopeId, // Will be updated by EnterFunction
        variables: {},
        parentId: parentLexicalId,
        closureScopeId: null,
        isPersistent: pendingPersistence.has(lexicalScopeId),
        thisBinding: null
      };
      console.log(`[storyReducer] Created scope object for lexical ${lexicalScopeId}`);
    } else {
      console.log(`[storyReducer] Updating existing scope ${lexicalScopeId} with Locals data`);
      if (!activeScopes[lexicalScopeId].parentId) activeScopes[lexicalScopeId].parentId = parentLexicalId;
      if (pendingPersistence.has(lexicalScopeId)) activeScopes[lexicalScopeId].isPersistent = true;
    }

    for (const paramName in locals) {
      if (!isInternalTracerVar(paramName)) {
        activeScopes[lexicalScopeId].variables[paramName] = { value: locals[paramName], type: typeof locals[paramName] };
      }
    }

    if (activeScopes[lexicalScopeId].isPersistent) {
      pendingPersistence.delete(lexicalScopeId);
    }

    // Update the outer 'pendingLexicalScopeId' via closure
    console.log(`[storyReducer] Stored pendingLexicalScopeId = ${lexicalScopeId}`);
    return lexicalScopeId;
  }


  // --- Process Raw Events ---
  for (let i = 0; i < rawEvents.length; i++) {
    const evt = rawEvents[i];
    console.log(`[storyReducer] Processing raw event [${i}]: ${evt.type}`);
    try {
      switch (evt.type) {
        case 'HEAP_UPDATE': {
          _processHeapUpdateEvent(evt, heapSnapshot);
          break;
        }
        case 'BeforeCall': {
          _processBeforeCallEvent(evt, callSiteLineStack);
          break;
        }
        case 'Locals': {
          // Call the extracted helper function
          pendingLexicalScopeId = _processLocalsEvent(evt, activeScopes, pendingPersistence);
          break;
        }
        case 'Closure': {
          _processClosureEvent(evt, activeScopes, pendingPersistence);
          break;
        }
        case 'VarWrite': {
          const assignPayload = processVarWriteEventAndUpdateScopes(evt, activeScopes, invocationToLexicalMap); // Updated function name
          if (assignPayload) {
            story.push({
              type: 'ASSIGN',
              payload: assignPayload
            });
            console.log(`[storyReducer] Pushed ASSIGN for ${assignPayload.varName} with invocation scope ${assignPayload.scopeId} at line ${assignPayload.line}`);
          }
          break;
        }
        case 'Step': {
          _processStepEvent(evt, story, buildScopesSnapshot, heapSnapshot);
          break;
        }
        case 'EnterFunction': {
          const { name, newScopeId, thisBinding, args } = evt.payload;
          let closureScopeIdFromPayload = evt.payload.closureScopeId;

          console.log(`[storyReducer] Handling EnterFunction for invocation scope ${newScopeId}, name: ${name}, closureScopeId from payload: ${closureScopeIdFromPayload}`);

          const callSiteLine = callSiteLineStack.pop() ?? evt.payload.callSiteLine ?? null;
          console.log(`[storyReducer] EnterFunction: Using callSiteLine ${callSiteLine}`);

          let functionLexicalId = null;
          if (pendingLexicalScopeId) {
            functionLexicalId = pendingLexicalScopeId;
            invocationToLexicalMap[newScopeId] = functionLexicalId;
            console.log(`[storyReducer] Populating invocationToLexicalMap: ${newScopeId} -> ${functionLexicalId}. Map state: ${JSON.stringify(invocationToLexicalMap)}`);

            const scopeToUpdate = activeScopes[functionLexicalId];
            if (scopeToUpdate) {
              scopeToUpdate.name = name;
              scopeToUpdate.closureScopeId = closureScopeIdFromPayload;
              scopeToUpdate.thisBinding = thisBinding;
              console.log(`[storyReducer] Updated scope ${functionLexicalId} with EnterFunction details`);
            } else {
              console.error(`[storyReducer] CRITICAL: EnterFunction expected scope ${functionLexicalId} to exist, but it was not found!`);
            }
            pendingLexicalScopeId = null;
          } else {
            console.warn(`[storyReducer] EnterFunction: No pendingLexicalScopeId found for invocation ${newScopeId}. Cannot map invocation to lexical scope.`);
          }

          story.push({
            type: 'CALL',
            payload: {
              funcName: name,
              args: args || [],
              callSiteLine: callSiteLine,
              newScopeId: newScopeId,
              closureScopeId: functionLexicalId ? activeScopes[functionLexicalId]?.parentId : null,
              thisBinding: thisBinding
            }
          });
          console.log(`[storyReducer] Pushed CALL event for ${name} (invocation ${newScopeId})`);

          scopeStack.push(newScopeId);
          console.log(`[storyReducer] Pushed invocation ${newScopeId} onto stack. Stack: ${scopeStack.join(',')}`);
          break;
        }
        case 'ExitFunction': {
          const { name, exitingScopeId, returnValue, returnLine } = evt.payload;
          console.log(`[storyReducer] Handling ExitFunction for invocation scope ${exitingScopeId}. Stack before pop: ${scopeStack.join(',')}`);

          story.push({
            type: 'RETURN',
            payload: {
              funcName: name,
              returnValue: returnValue,
              returnLine: returnLine,
              exitingScopeId: exitingScopeId
            }
          });
          console.log(`[storyReducer] Pushed RETURN event for ${name} (invocation ${exitingScopeId})`);

          if (scopeStack.length > 1 && scopeStack[scopeStack.length - 1] === exitingScopeId) {
            scopeStack.pop();
            console.log(`[storyReducer] Popped invocation scope ${exitingScopeId}. Stack after pop: ${scopeStack.join(',')}`);
          } else {
            console.warn(`[storyReducer] ExitFunction: Stack mismatch or empty stack when trying to pop ${exitingScopeId}. Stack: ${scopeStack.join(',')}`);
          }

          const exitedLexicalId = invocationToLexicalMap[exitingScopeId];
          delete invocationToLexicalMap[exitingScopeId];
          console.log(`[storyReducer] Cleaned up invocation map for invocation scope ${exitingScopeId} (Lexical: ${exitedLexicalId})`);

          break;
        }
        case 'ConsoleLog':
        case 'ConsoleWarn':
        case 'ConsoleError': {
          _processConsoleEvent(evt, story);
          break;
        }
        default:
          console.log(`[storyReducer] Skipping raw event type: ${evt.type}`);
          break;
      }
    } catch (error) {
      console.error(`[storyReducer] CRITICAL ERROR processing event [${i}], type ${evt.type}:`, error);
      console.error('[storyReducer] Event data:', JSON.stringify(evt));
      story.push({ type: 'INTERNAL_ERROR', payload: { message: `Reducer error: ${error.message}`, eventIndex: i, eventType: evt.type } });
    }
  }

  console.log(`[storyReducer] Finished processing. Final story length: ${story.length}`);
  return story;
}

module.exports = { storyReducer };