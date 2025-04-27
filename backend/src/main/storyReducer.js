// Transforms raw pipeline events into high-level story events per EVENT_SCHEMA.md
function storyReducer(rawEvents) {
  const story = [];
  let globals = {}; // Track global scope state
  for (let i = 0; i < rawEvents.length; i++) {
    const evt = rawEvents[i];
    switch (evt.type) {
      case 'Step': {
        const next = rawEvents[i + 1];
        // Skip step immediately before a function call
        if (next && next.type === 'EnterFunction') break;
        // Enhance STEP_LINE with a snapshot of globals
        story.push({
          type: 'STEP_LINE',
          payload: {
            line: evt.payload.line,
            col: evt.payload.col,
            snippet: evt.payload.snippet,
            globals: { ...globals } // Clone current globals
          }
        });
        break;
      }
      case 'EnterFunction': {
        const name = evt.payload.name;
        const returnLine = evt.payload.returnLine; // Assume tracer provides this
        let args = [];
        let locals = {}; // Store initial locals (parameters)
        const next = rawEvents[i + 1];
        // Coalesce following Locals event into args and locals if they exist
        if (
          next &&
          next.type === 'Locals' &&
          next.payload &&
          next.payload.locals != null &&
          typeof next.payload.locals === 'object'
        ) {
          locals = next.payload.locals;
          args = Object.values(locals);
          i++; // Consume the Locals event
        }
        story.push({
          type: 'CALL',
          payload: {
            funcName: name,
            args: args,
            locals: locals, // Include initial locals (parameters)
            returnLine: returnLine // Include return line number
          }
        });
        break;
      }
      case 'ExitFunction': {
        const name = evt.payload.name;
        // Expect returnValue and locals from the (modified) tracer event
        const returnValue = evt.payload.returnValue; // May be undefined
        const locals = evt.payload.locals || {}; // Snapshot at exit
        story.push({
          type: 'RETURN',
          payload: {
            funcName: name,
            returnValue: returnValue,
            locals: locals
          }
        });
        break;
      }
      case 'ConsoleLog':
      case 'ConsoleWarn':
      case 'ConsoleError': {
        const text = evt.payload.message || evt.payload.text;
        story.push({ type: 'CONSOLE', payload: { text } });
        break;
      }
      case 'VarWrite': {
        // Assume payload includes scope info, e.g., evt.payload.scope === 'global'
        const isGlobalWrite = evt.payload.scope === 'global';
        if (isGlobalWrite) {
          // Only update tracked globals if the write is global
          globals[evt.payload.name] = evt.payload.val;
        }
        // Add isGlobal flag to the ASSIGN event
        story.push({
          type: 'ASSIGN',
          payload: {
            varName: evt.payload.name,
            newValue: evt.payload.val,
            isGlobal: isGlobalWrite
          }
        });
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
