// Transforms raw pipeline events into high-level story events per EVENT_SCHEMA.md
function storyReducer(rawEvents) {
  const story = [];
  for (let i = 0; i < rawEvents.length; i++) {
    const evt = rawEvents[i];
    switch (evt.type) {
      case 'Step': {
        const next = rawEvents[i + 1];
        // Skip step immediately before a function call
        if (next && next.type === 'EnterFunction') break;
        story.push({ type: 'STEP_LINE', payload: { line: evt.payload.line, col: evt.payload.col, snippet: evt.payload.snippet } });
        break;
      }
      case 'EnterFunction': {
        const name = evt.payload.name;
        let args = [];
        const next = rawEvents[i + 1];
        // Coalesce following Locals event into args if locals exist
        if (
          next &&
          next.type === 'Locals' &&
          next.payload &&
          next.payload.locals != null &&
          typeof next.payload.locals === 'object'
        ) {
          args = Object.values(next.payload.locals);
          i++;
        }
        story.push({ type: 'CALL', payload: { funcName: name, args } });
        break;
      }
      case 'ExitFunction': {
        const name = evt.payload.name;
        story.push({ type: 'RETURN', payload: { funcName: name, returnValue: undefined } });
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
        story.push({ type: 'ASSIGN', payload: { varName: evt.payload.name, newValue: evt.payload.val } });
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
