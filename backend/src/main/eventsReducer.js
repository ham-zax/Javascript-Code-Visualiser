const _ = require('lodash');

// This file previously contained a complex reducer that filtered events.
// Based on analysis, this filtering was incorrect and removed essential events
// needed by storyReducer.
// The primary responsibility now is to handle duplicate ResolvePromise events.

// TODO: Consider removing the promise/microtask logic below if it's not strictly needed
//       or if storyReducer can handle the raw events directly.
const reduceEvents = (events) => {
  // For some reason, certain Promises (e.g. from `fetch` calls) seem to
  // resolve multiple times. I don't know why this happens, but it screws things
  // up for the view layer, so we'll just take the last one ¯\_(ツ)_/¯
  events = _(events)
  .reverse()
  .uniqWith((aEvt, bEvt) =>
    aEvt.type === 'ResolvePromise' &&
    bEvt.type === 'ResolvePromise' &&
    aEvt.payload.id === bEvt.payload.id
  )
  .reverse()
  .value()

  // Removed promise/microtask calculation logic (lines 24-92) to ensure
  // this function only de-duplicates ResolvePromise and passes all other
  // raw events directly to storyReducer.
  // The original 'events' array (after de-duping ResolvePromise) is now passed through.
  // The storyReducer is now responsible for processing all raw event types.
  console.log('[reduceEvents] Returning de-duplicated events. Count:', events.length);
  console.log('[reduceEvents] Event types being passed:', events.map(e => e.type));
  return events;
};

module.exports = { reduceEvents };
