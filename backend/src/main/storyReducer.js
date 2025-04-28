// Transforms raw pipeline events into high-level story events per EVENT_SCHEMA.md
function storyReducer(rawEvents) {
  console.log('[storyReducer] Received raw events: ' + JSON.stringify(rawEvents, null, 2));
  const story = [];
  const activeScopes = {}; // scopeId -> scope object
  const scopeStack = ['global'];
  let nextScopeIdCounter = 0;

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
    const snapshot = scopeStack
      .map(function(scopeId) {
        var s = activeScopes[scopeId];
        if (!s) {
          console.warn('[storyReducer] Scope ID ' + scopeId + ' not found in activeScopes!');
          return null;
        }
        var clonedVariables = cloneVars(s.variables);
        return {
          scopeId: s.scopeId,
          type: s.type,
          name: s.name,
          variables: clonedVariables,
          parentId: s.parentId,
          isPersistent: !!s.isPersistent,
          thisBinding: s.thisBinding == null ? null : s.thisBinding
        };
      })
      .filter(Boolean);
    console.log('[storyReducer] Built snapshot: ' + JSON.stringify(snapshot, null, 2));
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

  for (var i = 0; i < rawEvents.length; i++) {
    var evt = rawEvents[i];
    console.log('[storyReducer] Processing raw event [' + i + ']: ' + evt.type);
    try {
      switch (evt.type) {
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
          scopeStack.push(scopeId);
          console.log('[storyReducer] Added scope ' + scopeId + '. Stack: ' + scopeStack.join(','));
          break;
        }
        case 'Closure': {
          var closureId = evt.payload.closureId;
          var parentId2 = evt.payload.parentId;
          var bindings = evt.payload.bindings;
          if (!closureId) {
            console.error('[storyReducer] ERROR: Closure event missing closureId!');
            break;
          }
          console.log('[storyReducer] Handling Closure for scope ' + closureId + ', parent ' + parentId2);
          activeScopes[closureId] = {
            scopeId: closureId,
            type: 'closure',
            name: closureId,
            variables: {},
            parentId: parentId2,
            isPersistent: true,
            thisBinding: null
          };
          for (var b in bindings) {
            var bv = bindings[b];
            activeScopes[closureId].variables[b] = { value: bv, type: typeof bv };
          }
          scopeStack.push(closureId);
          console.log('[storyReducer] Added closure scope ' + closureId + '. Stack: ' + scopeStack.join(','));
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
          activeScopes[sid].variables[name] = { value: val, type: vtype };
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
              statementType: evt.payload.statementType
            }
          });
          console.log('[storyReducer] Pushed STEP_LINE event.');
          break;
        }
        case 'EnterFunction': {
          console.log('[storyReducer] Handling EnterFunction for scope ' + evt.payload.newScopeId);
          story.push({
            type: 'CALL',
            payload: {
              funcName: evt.payload.name,
              args: [],
              callSiteLine: evt.payload.callSiteLine,
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
