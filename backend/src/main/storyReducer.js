// Transforms raw pipeline events into high-level story events per EVENT_SCHEMA.md
// Transforms raw pipeline events into high-level story events per EVENT_SCHEMA.md
// Accepts initial state (though currently re-initializes internally) and the array of raw events
/**
 * Returns true if the variable name is an internal tracer variable.
 * Internal tracer variables start with _traceId or _callId.
 */
function isInternalTracerVar(name) {
  return typeof name === "string" && (name.startsWith("_traceId") || name.startsWith("_callId"));
}

function storyReducer(initialState, rawEvents) {
  // Support two-arg signature from test runner: events passed as second parameter
  rawEvents = Array.isArray(rawEvents) ? rawEvents : initialState || [];
  console.log('[storyReducer] Received raw events array (length ' + rawEvents.length + ')');
  const story = [];
  // TODO: Refactor to use initialState properly instead of re-initializing here
  const activeScopes = {}; // scopeId -> scope object (Keyed by LEXICAL IDs: funcScopeId-XXX or 'global')
  const scopeStack = ['global']; // Stack of INVOCATION IDs: funcScopeId-id-YYY or 'global'
  const pendingPersistence = new Set(); // Store LEXICAL scope IDs needing persistence
  const heapSnapshot = {}; // heapId -> heap object/array structure
  const invocationToLexicalMap = {}; // Map: invocationScopeId (funcScopeId-id-...) -> lexicalScopeId (funcScopeId-...)
  let pendingLexicalScopeId = null; // Stores the lexicalScopeId from the most recent Locals event, awaiting EnterFunction.

  // Helper to deep clone variables for snapshotting
  function cloneVars(vars) {
    const out = {};
    try {
      for (const [k, v] of Object.entries(vars || {})) {
        out[k] = { ...v };
      }
    } catch (e) {
      console.error('[storyReducer] Error cloning variables: ' + e + ' vars=' + JSON.stringify(vars));
    }
    return out;
  }

  // Helper to build scopes snapshot for STEP_LINE
  function buildScopesSnapshot() {
    console.log('[storyReducer] Building scope snapshot. Current invocation stack: ' + scopeStack.join(','));
    const visibleLexicalScopeIds = new Set(); // Store LEXICAL IDs
    const scopesToProcess = [...scopeStack]; // Start with INVOCATION IDs on the stack

    while (scopesToProcess.length > 0) {
      const currentInvocationId = scopesToProcess.shift(); // Process like a queue

      if (!currentInvocationId) continue;

      // Map invocation ID to lexical ID
      const currentLexicalId = currentInvocationId === 'global' ? 'global' : invocationToLexicalMap[currentInvocationId];

      if (!currentLexicalId || visibleLexicalScopeIds.has(currentLexicalId)) {
        // If no mapping found (shouldn't happen after Locals) or already processed, skip
        if (!currentLexicalId && currentInvocationId !== 'global') {
            console.warn(`[storyReducer] Snapshot: Could not find lexical mapping for invocation ID ${currentInvocationId}`);
        }
        continue;
      }

      visibleLexicalScopeIds.add(currentLexicalId);
      const scope = activeScopes[currentLexicalId]; // Access activeScopes using LEXICAL ID

      if (scope && scope.parentId && !visibleLexicalScopeIds.has(scope.parentId)) {
         // Add parent LEXICAL ID to process ancestors. Need to map it back to an invocation ID if we were processing invocation IDs?
         // Sticking to lexical IDs for processing ancestors seems simpler.
         // We need to ensure the parent *lexical* ID gets added if not already seen.
         // The `scopesToProcess` queue needs careful handling if mixing ID types.
         // Let's process purely based on lexical IDs once mapped.

         // Revised approach: Collect all lexical IDs first, then build snapshot.
         // No, let's trace parents directly using lexical IDs.
         scopesToProcess.push(scope.parentId); // Add parent LEXICAL ID
      }
       // Also add closure scope ID if relevant and not already processed?
       // if (scope && scope.closureScopeId && !visibleLexicalScopeIds.has(scope.closureScopeId)) {
       //    scopesToProcess.push(scope.closureScopeId);
       // }
    }

     // Add persistent scopes that might not be on the direct ancestry chain
     Object.keys(activeScopes).forEach(lexicalId => {
        if (activeScopes[lexicalId].isPersistent && !visibleLexicalScopeIds.has(lexicalId)) {
            visibleLexicalScopeIds.add(lexicalId);
            // Do we need to add their parents too? Yes, potentially.
            // This could get complex. Let's stick to stack + ancestors + explicitly persistent for now.
            // TODO: Revisit if closure visibility requires more complex traversal.
        }
     });


    const snapshot = Array.from(visibleLexicalScopeIds)
      .map(function(lexicalScopeId) { // Map using LEXICAL ID
        var s = activeScopes[lexicalScopeId]; // Access using LEXICAL ID
        if (!s) {
          // This shouldn't happen if visibleLexicalScopeIds is populated correctly
          console.warn('[storyReducer] Snapshot: Lexical Scope ID ' + lexicalScopeId + ' not found in activeScopes during final mapping!');
          return null;
        }
        // Deep clone the entire scope object for the snapshot, but filter out internal tracer variables
        const scopeClone = JSON.parse(JSON.stringify(s));
        if (scopeClone.variables) {
          for (const k of Object.keys(scopeClone.variables)) {
            if (isInternalTracerVar(k)) {
              delete scopeClone.variables[k];
            }
          }
        }
        return scopeClone;
      })
      .filter(Boolean); // Remove any nulls from scopes not found

    console.log('[storyReducer] Built snapshot with ' + snapshot.length + ' scopes (Lexical IDs: ' + Array.from(visibleLexicalScopeIds).join(', ') + '): ' + JSON.stringify(snapshot, null, 2));
    return snapshot;
  }

  // Initialize global scope
  activeScopes['global'] = {
    scopeId: 'global',
    type: 'global',
    name: 'global',
    variables: {},
    parentId: null,
    isPersistent: true,
    thisBinding: null // Typically null or an object for global 'this'
  };
  console.log('[storyReducer] Initialized activeScopes: ' + JSON.stringify(activeScopes, null, 2));

  // Use a stack to track callSiteLine for nested calls
  const callSiteLineStack = [];
  for (var i = 0; i < rawEvents.length; i++) {
    var evt = rawEvents[i];
    console.log('[storyReducer] Processing raw event [' + i + ']: ' + evt.type);
    try {
      switch (evt.type) {
        case 'BeforeCall': {
          // Push the callSiteLine for the next EnterFunction event
          callSiteLineStack.push(evt.payload.callSiteLine);
          break; // Do not emit a story event for BeforeCall
        }
        case 'HEAP_UPDATE': {
          // Update heap snapshot
          const { heapId, value } = evt.payload;
          heapSnapshot[heapId] = value;
          break;
        }
        case 'Locals': {
          const lexicalScopeId = evt.payload.scopeId; // This is funcScopeId-XXX
          const parentId = evt.payload.parentId;
          const locals = evt.payload.locals;

          if (!lexicalScopeId) {
            console.error('[storyReducer] ERROR: Locals event missing scopeId!');
            break;
          }
          console.log(`[storyReducer] Handling Locals for lexical scope ${lexicalScopeId}, parent ${parentId}`);

          // Create/Update scope object in activeScopes using the LEXICAL ID as the key
          if (!activeScopes[lexicalScopeId]) {
              activeScopes[lexicalScopeId] = {
                  scopeId: lexicalScopeId,
                  type: 'function', // Assume 'function' for now
                  name: lexicalScopeId, // Default name, EnterFunction will update it
                  variables: {},
                  parentId: parentId,
                  closureScopeId: null, // Will be set by EnterFunction if applicable
                  isPersistent: pendingPersistence.has(lexicalScopeId),
                  thisBinding: null // Will be set by EnterFunction
              };
              // Populate initial variables from locals
              for (const k in locals) {
                  if (!isInternalTracerVar(k)) {
                      const v = locals[k];
                      activeScopes[lexicalScopeId].variables[k] = { value: v, type: typeof v };
                  }
              }
              console.log(`[storyReducer] Created scope object for lexical ${lexicalScopeId}:`, JSON.stringify(activeScopes[lexicalScopeId], null, 2));
          } else {
              // Scope already exists (e.g., marked persistent earlier)
              console.log(`[storyReducer] Updating existing scope ${lexicalScopeId} with Locals data`);
              // Update details if necessary
              if (!activeScopes[lexicalScopeId].parentId) activeScopes[lexicalScopeId].parentId = parentId;
              if (pendingPersistence.has(lexicalScopeId)) activeScopes[lexicalScopeId].isPersistent = true;
              // Update variables from locals
              for (const k in locals) {
                  if (!isInternalTracerVar(k)) {
                      const v = locals[k];
                      activeScopes[lexicalScopeId].variables[k] = { value: v, type: typeof v };
                  }
              }
              console.log(`[storyReducer] Updated scope object for lexical ${lexicalScopeId}:`, JSON.stringify(activeScopes[lexicalScopeId], null, 2));
          }
          // Remove from pending persistence list if processed
          pendingPersistence.delete(lexicalScopeId);

          // Store this lexical ID, expecting EnterFunction next
          pendingLexicalScopeId = lexicalScopeId;
          console.log(`[storyReducer] Stored pendingLexicalScopeId = ${pendingLexicalScopeId}`);

          break;
        }
        case 'Closure': {
          // Task 2.3: Mark the PARENT scope as persistent
          var parentLexicalId = evt.payload.parentId; // This should be the LEXICAL ID of the scope being closed over
          var closureLexicalId = evt.payload.closureId; // This is the LEXICAL ID of the function/scope doing the closing

          if (!parentLexicalId) {
             console.warn('[storyReducer] Closure event for ' + closureLexicalId + ' missing parentId! Cannot mark persistent.');
             break;
          }

          console.log('[storyReducer] Handling Closure event: Scope ' + closureLexicalId + ' closes over parent scope ' + parentLexicalId);
          const parentScope = activeScopes[parentLexicalId]; // Look up using LEXICAL ID
          if (parentScope) {
            parentScope.isPersistent = true;
            console.log('[storyReducer] Marked parent scope ' + parentLexicalId + ' as persistent.');
          } else {
            // Parent scope hasn't been created by 'Locals' yet. Mark its LEXICAL ID as needing persistence.
            console.warn('[storyReducer] Closure: Parent scope ' + parentLexicalId + ' not found yet. Adding to pendingPersistence.');
            pendingPersistence.add(parentLexicalId); // Mark LEXICAL ID for persistence later
          }
          break;
        }
        case 'VarWrite': {
          const invocationScopeId = evt.payload.scopeId; // This is funcScopeId-id-YYY or 'global'
          const name = evt.payload.name;
          const val = evt.payload.val;
          const vtype = evt.payload.valueType;
          const line = evt.payload.line; // Get line number directly from VarWrite payload

          if (!invocationScopeId) {
            console.error('[storyReducer] ERROR: VarWrite event missing scopeId!');
            break;
          }

          // Determine and validate lexical scope mapping
          // Map invocation ID to lexical ID
          let lexicalScopeIdToUpdate = invocationScopeId; // Default to global or if mapping fails
          if (invocationScopeId !== 'global') {
              console.log(`[storyReducer] VarWrite: Looking up invocation scope ${invocationScopeId} in map: ${JSON.stringify(invocationToLexicalMap)}`);
              lexicalScopeIdToUpdate = invocationToLexicalMap[invocationScopeId];
              if (!lexicalScopeIdToUpdate) {
                  // This indicates a problem - VarWrite occurred before Locals linked the IDs,
                  // or the invocation ID is incorrect.
                  console.error(`[storyReducer] CRITICAL: VarWrite lookup failed for invocation scope ${invocationScopeId}! Map state: ${JSON.stringify(invocationToLexicalMap)}`);
                  // Attempt to find the scope by searching activeScopes for a matching name? Risky.
                  // For now, we cannot reliably update. Skip this event.
                  break;
              }
              console.log(`[storyReducer] VarWrite: Mapped invocation ${invocationScopeId} -> lexical ${lexicalScopeIdToUpdate}`);
          }

          console.log(`[storyReducer] Handling VarWrite for var '${name}' in lexical scope ${lexicalScopeIdToUpdate} (derived from invocation ${invocationScopeId})`);

          // Ensure the target lexical scope exists in activeScopes
          if (!activeScopes[lexicalScopeIdToUpdate]) {
             // If it doesn't exist here, something is wrong with event ordering or mapping logic.
             // Locals should have created this scope.
            console.error(`[storyReducer] CRITICAL: VarWrite target lexical scope ${lexicalScopeIdToUpdate} (from invocation ${invocationScopeId}) was not found in activeScopes! Active: ${Object.keys(activeScopes)}`);
            break; // Skip this event
          }

          // Update the variable in the correct lexical scope's variable map
          const scopeToUpdate = activeScopes[lexicalScopeIdToUpdate];
          if (!scopeToUpdate.variables) {
              console.warn(`[storyReducer] VarWrite: Lexical scope ${lexicalScopeIdToUpdate} has no variables object! Initializing.`);
              scopeToUpdate.variables = {};
          }

          if (val && val.type === 'reference' && val.heapId) {
            scopeToUpdate.variables[name] = { value: { type: 'reference', heapId: val.heapId, valueType: vtype }, type: vtype };
          } else {
            scopeToUpdate.variables[name] = { value: val, type: vtype };
          }

          // Log updated variable object
          console.log(`[storyReducer] Updated variable '${name}' in lexical scope '${lexicalScopeIdToUpdate}':`, JSON.stringify(scopeToUpdate.variables[name], null, 2));

          // --- Story Event ---
          // Only push ASSIGN if not an internal tracer variable
          if (!isInternalTracerVar(name)) {
            // Line number is now directly available from the VarWrite event payload
            if (line === undefined || line === null) {
               console.warn(`[storyReducer] ASSIGN for ${name}: Line number missing in VarWrite event payload!`);
            }

            story.push({
              type: 'ASSIGN',
              payload: {
                varName: name,
                newValue: val,
                valueType: vtype,
                scopeId: invocationScopeId, // Use INVOCATION ID for the runtime event payload
                line: line
              }
            });
            console.log(`[storyReducer] Pushed ASSIGN for ${name} with invocation scope ${invocationScopeId} at line ${line}`);
          }
          break;
        }
        case 'Step': {
          console.log('[storyReducer] Handling Step for line ' + evt.payload.line);
          var snapshot2 = buildScopesSnapshot();
          story.push({
            type: 'STEP_LINE',
            payload: {
              line: evt.payload.line,
              col: evt.payload.col,
              snippet: evt.payload.snippet,
              scopes: snapshot2,
              heap: { ...heapSnapshot },
              statementType: evt.payload.statementType
            }
          });
          console.log('[storyReducer] Pushed STEP_LINE event.');
          break;
        }
        case 'EnterFunction': {
          const { name, newScopeId, closureScopeId, thisBinding, args } = evt.payload; // newScopeId is INVOCATION ID
          console.log(`[storyReducer] Handling EnterFunction for invocation scope ${newScopeId}, name: ${name}, closureScopeId: ${closureScopeId}`);

          // --- Get callSiteLine ---
          let callSiteLine = null;
          if (callSiteLineStack.length > 0) {
            callSiteLine = callSiteLineStack.pop();
            console.log(`[storyReducer] EnterFunction: Using callSiteLine ${callSiteLine} from stack`);
          } else {
            console.warn(`[storyReducer] EnterFunction: No callSiteLine in stack for ${name} (invocation ${newScopeId}) at index ${i}.`);
            callSiteLine = evt.payload.callSiteLine || null; // Fallback
          }

          // --- Push CALL story event ---
          story.push({
            type: 'CALL',
            payload: {
              funcName: name,
              args: args || [],
              callSiteLine: callSiteLine,
              newScopeId: newScopeId, // INVOCATION ID
              closureScopeId: closureScopeId, // LEXICAL ID
              thisBinding: thisBinding
            }
          });
          console.log(`[storyReducer] Pushed CALL event for ${name} (invocation ${newScopeId})`);

          // --- Update internal state ---
          // Push INVOCATION ID onto the stack
          scopeStack.push(newScopeId);
          console.log(`[storyReducer] Pushed invocation ${newScopeId} onto stack. Stack: ${scopeStack.join(',')}`);

          // Check if we have a pending lexical scope ID from a preceding Locals event
          if (pendingLexicalScopeId) {
              console.log(`[storyReducer] EnterFunction: Found pendingLexicalScopeId = ${pendingLexicalScopeId}. Linking now.`);
              const lexicalScopeId = pendingLexicalScopeId;
              // Linkage complete!
              invocationToLexicalMap[newScopeId] = lexicalScopeId;
              console.log(`[storyReducer] Populating invocationToLexicalMap: ${newScopeId} -> ${lexicalScopeId}. Map state: ${JSON.stringify(invocationToLexicalMap)}`);

              // Update the existing scope (created by Locals) with EnterFunction details
              const scopeToUpdate = activeScopes[lexicalScopeId];
              if (scopeToUpdate) {
                  scopeToUpdate.name = name; // Update name
                  scopeToUpdate.closureScopeId = closureScopeId; // Set closure scope
                  scopeToUpdate.thisBinding = thisBinding; // Set 'this' binding
                  console.log(`[storyReducer] Updated scope ${lexicalScopeId} with EnterFunction details:`, JSON.stringify(scopeToUpdate, null, 2));
              } else {
                  // This shouldn't happen if Locals created the scope
                  console.error(`[storyReducer] CRITICAL: EnterFunction expected scope ${lexicalScopeId} to exist, but it was not found!`);
              }
              // Clear the pending ID
              pendingLexicalScopeId = null;
          } else {
              // Locals hasn't arrived yet (or this is global/unexpected state)
              console.warn(`[storyReducer] EnterFunction: No pendingLexicalScopeId found for invocation ${newScopeId}. This might indicate an unexpected event order or issue.`);
              // We cannot create the mapping yet.
          }
          break;
        }
        case 'ExitFunction': {
          const { name, exitingScopeId, returnValue, returnLine } = evt.payload; // exitingScopeId is INVOCATION ID
          console.log(`[storyReducer] Handling ExitFunction for invocation scope ${exitingScopeId}. Stack before pop: ${scopeStack.join(',')}`);

          // 1. Push RETURN story event
          story.push({
            type: 'RETURN',
            payload: {
              funcName: name,
              returnValue: returnValue,
              returnLine: returnLine,
              exitingScopeId: exitingScopeId // Pass INVOCATION ID
            }
          });
          console.log(`[storyReducer] Pushed RETURN event for ${name} (invocation ${exitingScopeId})`);

          // 2. Update internal state:
          //    a. Pop INVOCATION ID from stack
          if (scopeStack.length > 1 && scopeStack[scopeStack.length - 1] === exitingScopeId) {
            scopeStack.pop();
            console.log(`[storyReducer] Popped invocation scope ${exitingScopeId}. Stack after pop: ${scopeStack.join(',')}`);
          } else if (scopeStack.length <= 1) {
             console.warn(`[storyReducer] ExitFunction: Attempted to pop ${exitingScopeId} but stack is empty or only contains global.`);
          } else {
            console.warn(`[storyReducer] ExitFunction: Stack mismatch! Tried to pop ${exitingScopeId}, but stack top was ${scopeStack[scopeStack.length - 1]}. Stack: ${scopeStack.join(',')}`);
            // Attempt recovery: Search for and remove the ID if present? Or just log?
            // For now, just log the warning. If this happens, event ordering or Enter/Exit pairing is likely broken.
          }

          //    b. Clean up maps associated with this invocation
          const lexicalId = invocationToLexicalMap[exitingScopeId]; // Get corresponding lexical ID
          delete invocationToLexicalMap[exitingScopeId]; // Remove invocation -> lexical mapping
          // pendingInvocationDetails no longer exists, so no need to clean it up.
          console.log(`[storyReducer] Cleaned up invocation map for invocation scope ${exitingScopeId} (Lexical: ${lexicalId})`);

          // Note: We generally DO NOT remove the scope from activeScopes here,
          // because it might be persistent due to closures. Garbage collection / cleanup
          // of non-persistent scopes could be a future enhancement if needed.
          break;
        }
        case 'ConsoleLog':
        case 'ConsoleWarn':
        case 'ConsoleError': {
          var text = evt.payload.text || evt.payload.message || '';
          console.log('[storyReducer] Handling ' + evt.type + ': ' + text.trim());
          story.push({ type: 'CONSOLE', payload: { text: text } });
          break;
        }
        default:
          console.log('[storyReducer] Skipping raw event type: ' + evt.type);
          break;
      }
    } catch (error) {
      console.error('[storyReducer] CRITICAL ERROR at event ' + i + ', type ' + evt.type + ': ' + error);
      console.error('[storyReducer] Event data: ' + JSON.stringify(evt));
    }
  }

  console.log('[storyReducer] Finished processing. Final story length: ' + story.length);
  return story;
}

module.exports = { storyReducer };
