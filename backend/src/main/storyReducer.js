// Transforms raw pipeline events into high-level story events per EVENT_SCHEMA.md
function storyReducer(rawEvents) {
  const story = [];
  const activeScopes = {}; // scopeId -> scope object
  const scopeStack = ['global'];
  let nextScopeIdCounter = 0;

  // Helper to deep clone variables for snapshotting
  function cloneVars(vars) {
    const out = {};
    for (const [k, v] of Object.entries(vars)) {
      out[k] = { ...v };
    }
    return out;
  }

  // Helper to build scopes snapshot for STEP_LINE
  function buildScopesSnapshot() {
    // Only include scopes currently on the stack (visible)
    return scopeStack
      .map(scopeId => {
        const s = activeScopes[scopeId];
        if (!s) return null;
        return {
          scopeId: s.scopeId,
          type: s.type,
          name: s.name,
          variables: cloneVars(s.variables),
          parentId: s.parentId,
          isPersistent: !!s.isPersistent,
          thisBinding: s.thisBinding ?? null
        };
      })
      .filter(Boolean);
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

  for (let i = 0; i < rawEvents.length; i++) {
    const evt = rawEvents[i];
    switch (evt.type) {
      case 'Locals': {
        // Create a new function scope
        const { scopeId, parentId, locals } = evt.payload;
        activeScopes[scopeId] = {
          scopeId,
          type: 'function',
          name: scopeId,
          variables: {},
          parentId,
          isPersistent: false,
          thisBinding: null
        };
        for (const [k, v] of Object.entries(locals)) {
          activeScopes[scopeId].variables[k] = { value: v, type: typeof v };
        }
        scopeStack.push(scopeId);
        break;
      }
      case 'Closure': {
        const { closureId, parentId, bindings } = evt.payload;
        activeScopes[closureId] = {
          scopeId: closureId,
          type: 'closure',
          name: closureId,
          variables: {},
          parentId,
          isPersistent: true,
          thisBinding: null
        };
        for (const [k, v] of Object.entries(bindings)) {
          activeScopes[closureId].variables[k] = { value: v, type: typeof v };
        }
        scopeStack.push(closureId);
        break;
      }
      case 'VarWrite': {
        const { scopeId, name, val, valueType } = evt.payload;
        if (!activeScopes[scopeId]) {
          activeScopes[scopeId] = {
            scopeId,
            type: 'unknown',
            name: scopeId,
            variables: {},
            parentId: null,
            isPersistent: false,
            thisBinding: null
          };
        }
        activeScopes[scopeId].variables[name] = { value: val, type: valueType };
        // Emit ASSIGN event per new schema
        story.push({
          type: 'ASSIGN',
          payload: {
            varName: name,
            newValue: val,
            valueType: valueType,
            scopeId: scopeId
          }
        });
        break;
      }
      case 'Step': {
        story.push({
          type: 'STEP_LINE',
          payload: {
            line: evt.payload.line,
            col: evt.payload.col,
            snippet: evt.payload.snippet,
            scopes: buildScopesSnapshot(),
            statementType: evt.payload.statementType
          }
        });
        break;
      }
      case 'EnterFunction': {
        story.push({
          type: 'CALL',
          payload: {
            funcName: evt.payload.name,
            args: [], // args can be filled if Locals event is adjacent
            callSiteLine: evt.payload.callSiteLine,
            newScopeId: evt.payload.newScopeId,
            closureScopeId: evt.payload.closureScopeId,
            thisBinding: evt.payload.thisBinding
          }
        });
        break;
      }
      case 'ExitFunction': {
        story.push({
          type: 'RETURN',
          payload: {
            funcName: evt.payload.name,
            returnValue: evt.payload.returnValue,
            returnLine: evt.payload.returnLine,
            exitingScopeId: evt.payload.exitingScopeId
          }
        });
        const idx = scopeStack.lastIndexOf(evt.payload.exitingScopeId);
        if (idx !== -1) scopeStack.splice(idx, 1);
        break;
      }
      case 'ConsoleLog':
      case 'ConsoleWarn':
      case 'ConsoleError': {
        const text = evt.payload.text || evt.payload.message;
        story.push({ type: 'CONSOLE', payload: { text } });
        break;
      }
      default:
        // ignore all other events
        break;
    }
  }
  return story;
}

module.exports = { storyReducer };
