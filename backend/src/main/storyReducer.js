// Transforms raw pipeline events into high-level story events per EVENT_SCHEMA.md
// Transforms raw pipeline events into high-level story events per EVENT_SCHEMA.md
// Accepts initial state (though currently re-initializes internally) and the array of raw events
function storyReducer(rawEvents = []) { // Accept single argument with default
  console.log('[storyReducer] Received raw events array (length ' + rawEvents.length + ')');
  const story = [];
  // TODO: Refactor to use initialState properly instead of re-initializing here
  const activeScopes = {}; // scopeId -> scope object
  const scopeStack = ['global'];
  let nextScopeIdCounter = 0;
  const pendingPersistence = new Set(); // Store scope IDs needing persistence
  const heapSnapshot = {}; // heapId -> heap object/array structure

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
    console.log('[storyReducer] Building scope snapshot. Current stack: ' + scopeStack.join(','));
    const visibleScopeIds = new Set();
    const scopesToProcess = [...scopeStack]; // Start with scopes on the stack

    while (scopesToProcess.length > 0) {
      const currentId = scopesToProcess.shift(); // Process like a queue

      if (!currentId || visibleScopeIds.has(currentId)) {
        continue; // Skip null/undefined or already processed scopes
      }

      visibleScopeIds.add(currentId);
      const scope = activeScopes[currentId];

      if (scope && scope.parentId) {
        scopesToProcess.push(scope.parentId); // Add parent to process ancestors
      }
      // Also consider adding persistent scopes that might not be direct ancestors?
      // For now, stick to stack + ancestors as per initial plan.
    }

    const snapshot = Array.from(visibleScopeIds)
      .map(function(scopeId) {
        var s = activeScopes[scopeId];
        if (!s) {
          console.warn('[storyReducer] Snapshot: Scope ID ' + scopeId + ' not found in activeScopes!');
          return null;
        }
        // Deep clone the entire scope object for the snapshot
        return JSON.parse(JSON.stringify(s));
      })
      .filter(Boolean); // Remove any nulls from scopes not found

    // Task 4.1: Log detailed snapshot structure
    console.log('[storyReducer] Built snapshot with ' + snapshot.length + ' scopes: ' + JSON.stringify(snapshot, null, 2));
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
    thisBinding: null
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
          var scopeId = evt.payload.scopeId;
          var parentId = evt.payload.parentId;
          var locals = evt.payload.locals;
          if (!scopeId) {
            console.error('[storyReducer] ERROR: Locals event missing scopeId!');
            break;
          }
          console.log('[storyReducer] Handling Locals for scope ' + scopeId + ', parent ' + parentId);
          activeScopes[scopeId] = {
            scopeId: scopeId,
            type: 'function',
            name: scopeId,
            variables: {},
            parentId: parentId,
            isPersistent: false,
            thisBinding: null
          };
          for (var k in locals) {
            var v = locals[k];
            activeScopes[scopeId].variables[k] = { value: v, type: typeof v };
          }
          // Task 4.1: Log created scope object
          console.log('[storyReducer] Created/Updated scope object:', JSON.stringify(activeScopes[scopeId], null, 2));
          scopeStack.push(scopeId);
          console.log('[storyReducer] Added scope ' + scopeId + '. Stack: ' + scopeStack.join(','));
          break;
        }
        case 'Closure': {
          // Task 2.3: Mark the PARENT scope as persistent
          var parentId = evt.payload.parentId; // Renamed from parentId2 for clarity
          var closureId = evt.payload.closureId; // Keep for logging if needed
          // var bindings = evt.payload.bindings; // Bindings are not directly used here anymore

          if (!parentId) {
             console.warn('[storyReducer] Closure event for ' + closureId + ' missing parentId! Cannot mark persistent.');
             break;
          }

          console.log('[storyReducer] Handling Closure event for parent scope ' + parentId);
          const parentScope = activeScopes[parentId];
          if (parentScope) {
            parentScope.isPersistent = true;
            console.log('[storyReducer] Marked parent scope ' + parentId + ' as persistent.');
          } else {
            console.warn('[storyReducer] Closure: Parent scope ' + parentId + ' not found yet. Adding to pendingPersistence.');
            pendingPersistence.add(parentId); // Mark for persistence later
          }
          // Do NOT create a new scope object for the closure itself or push it onto the stack.
          break;
        }
        case 'VarWrite': {
          var sid = evt.payload.scopeId;
          var name = evt.payload.name;
          var val = evt.payload.val;
          var vtype = evt.payload.valueType;
          if (!sid) {
            console.error('[storyReducer] ERROR: VarWrite event missing scopeId!');
            break;
          }
          console.log('[storyReducer] Handling VarWrite in scope ' + sid + ' for var ' + name);
          if (!activeScopes[sid]) {
            console.warn('[storyReducer] VarWrite: Scope ' + sid + ' not found! Creating placeholder.');
            activeScopes[sid] = { scopeId: sid, type: 'unknown', name: sid, variables: {}, parentId: null, isPersistent: false, thisBinding: null };
          }
          // If value is a heap reference, store as such
          if (val && val.type === 'reference' && val.heapId) {
            activeScopes[sid].variables[name] = { value: { type: 'reference', heapId: val.heapId, valueType: vtype }, type: vtype };
          } else {
            activeScopes[sid].variables[name] = { value: val, type: vtype };
          }
          // Task 4.1: Log updated variable object
          console.log(`[storyReducer] Updated variable '${name}' in scope '${sid}':`, JSON.stringify(activeScopes[sid].variables[name], null, 2));
          story.push({
            type: 'ASSIGN',
            payload: {
              varName: name,
              newValue: val,
              valueType: vtype,
              scopeId: sid,
              line: (i > 0 ? rawEvents[i - 1].payload.line : null)
            }
          });
          console.log('[storyReducer] Pushed ASSIGN for ' + name);
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
          console.log('[storyReducer] Handling EnterFunction for scope ' + evt.payload.newScopeId);
          // Pop the most recent callSiteLine from the stack, if available
          let callSiteLine = callSiteLineStack.length > 0 ? callSiteLineStack.pop() : evt.payload.callSiteLine;
          story.push({
            type: 'CALL',
            payload: {
              funcName: evt.payload.name,
              args: [],
              callSiteLine: callSiteLine,
              newScopeId: evt.payload.newScopeId,
              closureScopeId: evt.payload.closureScopeId,
              thisBinding: evt.payload.thisBinding
            }
          });
          console.log('[storyReducer] Pushed CALL event for ' + evt.payload.name);
          break;
        }
        case 'ExitFunction': {
          console.log('[storyReducer] Handling ExitFunction for scope ' + evt.payload.exitingScopeId + '. Stack before pop: ' + scopeStack.join(','));
          story.push({
            type: 'RETURN',
            payload: {
              funcName: evt.payload.name,
              returnValue: evt.payload.returnValue,
              returnLine: evt.payload.returnLine,
              exitingScopeId: evt.payload.exitingScopeId
            }
          });
          var idx = scopeStack.lastIndexOf(evt.payload.exitingScopeId);
          if (idx > 0) {
            scopeStack.splice(idx, 1);
          } else if (evt.payload.exitingScopeId !== 'global') {
            console.warn('[storyReducer] ExitFunction pop failed. Stack: ' + scopeStack.join(','));
          }
          console.log('[storyReducer] Pushed RETURN event and updated stack.');
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
