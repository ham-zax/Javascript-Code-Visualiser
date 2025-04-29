const { parentPort, workerData } = require('worker_threads');
const asyncHooks = require('async_hooks');
const util = require('util');
const fs = require('fs');
const babel = require('@babel/core'); // NOT 'babel-core'
const { VM } = require('vm2');

const fetch = require('node-fetch');
const _ = require('lodash');
// Falafel removed
const prettyFormat = require('pretty-format').default; // Import default export

/*
 * --- Heap Tracking Infrastructure ---
 * Enhanced to handle heap objects, arrays, and functions with unique heap IDs,
 * circular reference detection, and function definingScopeId support.
 */
const heapRegistry = {}; // Stores serialized heap objects { h1: {...}, h2: [...] }
const objectToHeapId = new WeakMap(); // Maps live object -> heapId ('hX')
let nextHeapId = 1;

function getNextHeapId() {
  return 'h' + (nextHeapId++);
}

// Depth-limited, circular-safe serializer for heap objects/arrays/functions
function serializeForHeap(target, heapId, depth = 0, maxDepth = 3, visited = new Map()) {
    if (target === null || target === undefined) return target;

    // Handle primitives directly
    const targetType = typeof target;
    if (targetType !== 'object' && targetType !== 'function') return target;

    // Check visited map to handle circular references
    if (visited.has(target)) {
        return { type: 'circular', heapId: visited.get(target) };
    }

    // Add to visited map *before* processing children/properties
    visited.set(target, heapId);

    // Handle Functions
    if (targetType === 'function') {
        // Attempt to get defining scope ID (assumes Babel plugin adds _lexicalScopeId)
        const definingScopeId = target._lexicalScopeId || null;
        const funcDetails = {
            type: 'function',
            heapId: heapId,
            name: target.name || 'anonymous',
            definingScopeId: definingScopeId,
        };
        heapRegistry[heapId] = funcDetails;
        return funcDetails;
    }

    // Handle Arrays
    if (Array.isArray(target)) {
        if (depth >= maxDepth) return { type: 'array', heapId, representation: `Array(${target.length})` };
        const serializedArray = {
            type: 'array',
            heapId: heapId,
            elements: target.map((v, index) => {
                let elementHeapId = objectToHeapId.get(v);
                if ((typeof v === 'object' || typeof v === 'function') && v !== null && !elementHeapId) {
                    elementHeapId = getNextHeapId();
                    objectToHeapId.set(v, elementHeapId);
                }
                return serializeForHeap(v, elementHeapId || null, depth + 1, maxDepth, visited);
            })
        };
        heapRegistry[heapId] = serializedArray;
        return serializedArray;
    }

    // Handle Objects
    if (targetType === 'object') {
        return _serializeObjectForHeap(target, heapId, depth, maxDepth, visited);
    }
// Helper: Extracted object serialization logic for heap
function _serializeObjectForHeap(target, heapId, depth, maxDepth, visited) {
    if (depth >= maxDepth) return { type: 'object', heapId, representation: 'Object' };
    const serializedObj = {
        type: 'object',
        heapId: heapId,
        properties: {}
    };
    for (const k of Object.keys(target)) {
        try {
            const v = target[k];
            let valueHeapId = objectToHeapId.get(v);
            if ((typeof v === 'object' || typeof v === 'function') && v !== null && !valueHeapId) {
                valueHeapId = getNextHeapId();
                objectToHeapId.set(v, valueHeapId);
            }
            serializedObj.properties[k] = serializeForHeap(v, valueHeapId || null, depth + 1, maxDepth, visited);
        } catch (e) {
            serializedObj.properties[k] = '[Unserializable]';
        }
    }
    heapRegistry[heapId] = serializedObj;
    return serializedObj;
}

    // Fallback for unexpected types
    return `[Unsupported Type: ${targetType}]`;
}
const { traceLoops } = require('./loopTracer');
const traceLines = require('./traceLines');
// const traceScopeAndClosures = require('./traceScopeAndClosures'); // Replaced
const { traceScopePlugin } = require('./traceScope');             // New scope plugin
const { traceVariablesPlugin } = require('./traceVariables');       // New variable plugin
const traceFunctions = require('./traceFunctions'); // Require the new plugin
const preserveLoc = require('./preserveLoc');

const LOG_FILE = './log.txt';
fs.writeFileSync(LOG_FILE, '');
const log = (...msg) => fs.appendFileSync(
  LOG_FILE,
  msg.map(m => _.isString(m) ? m : prettyFormat(m)).join(' ') + '\n'
);

const event = (type, payload) => ({ type, payload });
const Events = {
  ConsoleLog: (message) => event('ConsoleLog', { message }),
  ConsoleWarn: (message) => event('ConsoleWarn', { message }),
  ConsoleError: (message) => event('ConsoleError', { message }),

  EnterFunction: (id, name, start, end) => event('EnterFunction', { id, name, start, end }),
  ExitFunction: (id, name, start, end) => event('ExitFunction', { id, name, start, end }),
  ErrorFunction: (message, id, name, start, end) => event('ErrorFunction', { message, id, name, start, end }),

  InitPromise: (id, parentId) => event('InitPromise', { id, parentId }),
  ResolvePromise: (id) => event('ResolvePromise', { id }),
  BeforePromise: (id) => event('BeforePromise', { id }),
  AfterPromise: (id) => event('AfterPromise', { id }),

  InitMicrotask: (id, parentId) => event('InitMicrotask', { id, parentId }),
  BeforeMicrotask: (id) => event('BeforeMicrotask', { id }),
  AfterMicrotask: (id) => event('AfterMicrotask', { id }),

  InitTimeout: (id, callbackName) => event('InitTimeout', { id, callbackName }),
  BeforeTimeout: (id) => event('BeforeTimeout', { id }),

  Step: (line, col, snippet) => event('Step', { line, col, snippet }),
  Locals: (locals) => event('Locals', { locals }),
  VarWrite: (name, value) => event('VarWrite', { name, value }),
  VarRead: (name, value) => event('VarRead', { name, value }),
  Closure: (fnId, bindings) => event('Closure', { fnId, bindings }),
  // NEW: Heap Update Event Definition
  HeapUpdate: (heapId, value) => event('HEAP_UPDATE', { heapId, value }),

  UncaughtError: (error) => event('UncaughtError', {
    name: (error || {}).name,
    stack: (error || {}).stack,
    message: (error || {}).message,
  }),
  EarlyTermination: (message) => event('EarlyTermination', { message }),
};

let events = [];
const postEvent = (event) => {
  events.push(event);
  // Only stringify once before sending
  try {
      parentPort.postMessage(JSON.stringify(event));
  } catch (e) {
      console.error("[Worker] Error posting event: ", e);
      // Handle potential circular structure errors during stringify if serializeForHeap fails
      const minimalEvent = { type: event.type, error: "Serialization Error" };
      if (event.payload?.heapId) minimalEvent.heapId = event.payload.heapId;
      if (event.payload?.scopeId) minimalEvent.scopeId = event.payload.scopeId;
      if (event.payload?.name) minimalEvent.name = event.payload.name;
      parentPort.postMessage(JSON.stringify(minimalEvent));
  }
}

// We only care about these async hook types:
//   PROMISE, Timeout
const ignoredAsyncHookTypes = [
  'FSEVENTWRAP', 'FSREQCALLBACK', 'GETADDRINFOREQWRAP', 'GETNAMEINFOREQWRAP',
  'HTTPPARSER', 'JSSTREAM', 'PIPECONNECTWRAP', 'PIPEWRAP', 'PROCESSWRAP',
  'QUERYWRAP', 'SHUTDOWNWRAP', 'SIGNALWRAP', 'STATWATCHER', 'TCPCONNECTWRAP',
  'TCPSERVERWRAP', 'TCPWRAP', 'TTYWRAP', 'UDPSENDWRAP', 'UDPWRAP', 'WRITEWRAP',
  'ZLIB', 'SSLCONNECTION', 'PBKDF2REQUEST', 'RANDOMBYTESREQUEST', 'TLSWRAP',
  'DNSCHANNEL',
];
const isIgnoredHookType = (type) => ignoredAsyncHookTypes.includes(type);

// --- async_hooks setup moved below Babel transform ---

const functionDefinitionTypes = [
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
];
const arrowFnImplicitReturnTypesRegex = /Literal|Identifier|(\w)*Expression/;

// traceBlock function removed (was Falafel-specific)

const jsSourceCode = workerData; // Keep the original source untouched
console.log("[Worker] jsSourceCode before Babel:", typeof jsSourceCode, jsSourceCode ? jsSourceCode.slice(0, 50) + '...' : 'null/undefined'); // Log type and preview

// Falafel transformation block removed

// --- Run Babel ---
let modifiedSource = '';
try {
  console.log("Starting Babel transformation..."); // Add log
  modifiedSource = babel
    .transform(jsSourceCode, { // Use original jsSourceCode here
      filename: 'userCode.js', // Optional: Good practice for sourcemaps/errors
      sourceMaps: true,      // Enable source maps
      plugins: [
        preserveLoc,                                 // 1) stash loc
        traceLoops,                                  // 2) timeout checks
        [ traceLines, { originalSource: jsSourceCode } ], // 3) step calls
        traceFunctions,                              // 4) enter/exit/errorFunc
        traceScopePlugin,                            // 5) locals & closures
        traceVariablesPlugin                         // 6) varWrite & varRead
      ]
    })
    .code;
  console.log("Babel transformation complete."); // Add log

  // --- DEBUG: Log the final instrumented code to CONSOLE ---
  console.log("--- START Instrumented Code (Console) ---");
  console.log(modifiedSource);
  console.log("--- END Instrumented Code (Console) ---");
  // --- END DEBUG ---

  // Optional: Log transformed code for debugging to file
  log('--- Transformed Code ---');
  log(modifiedSource); // <--- UNCOMMENTED THIS
  log('--- End Transformed Code ---');
} catch (babelError) {
  console.error("Error during Babel transformation:", babelError); // Keep existing error handling
  postEvent(Events.UncaughtError({
    name: 'InstrumentationError',
    message: `Babel Transformation Error: ${babelError.message}`,
    stack: babelError.stack
  }));
  process.exit(1);
}

// --- MOVE async_hooks setup HERE ---
const asyncIdToResource = {}; // Keep resource map scoped if needed
const init = (asyncId, type, triggerAsyncId, resource) => {
  asyncIdToResource[asyncId] = resource;
  if (type === 'PROMISE') {
    postEvent(Events.InitPromise(asyncId, triggerAsyncId));
  }
  if (type === 'Timeout') {
    const callbackName = resource._onTimeout.name || 'anonymous';
    postEvent(Events.InitTimeout(asyncId, callbackName));
  }
  if (type === 'Microtask') {
    postEvent(Events.InitMicrotask(asyncId, triggerAsyncId));
  }
};
const before = (asyncId) => {
  const resource = asyncIdToResource[asyncId] || {};
  const resourceName = (resource.constructor).name;
  if (resourceName === 'PromiseWrap') {
    postEvent(Events.BeforePromise(asyncId));
  }
  if (resourceName === 'Timeout') {
    postEvent(Events.BeforeTimeout(asyncId));
  }
  if (resourceName === 'AsyncResource') {
    postEvent(Events.BeforeMicrotask(asyncId));
  }
};
const after = (asyncId) => {
  const resource = asyncIdToResource[asyncId] || {};
  const resourceName = (resource.constructor).name;
  if (resourceName === 'PromiseWrap') {
    postEvent(Events.AfterPromise(asyncId));
  }
  if (resourceName === 'AsyncResource') {
    postEvent(Events.AfterMicrotask(asyncId));
  }
};
const destroy = (asyncId) => {
  // Optional: Clean up asyncIdToResource if needed, be careful with timing
  // delete asyncIdToResource[asyncId];
};
const promiseResolve = (asyncId) => {
    // Add safety check inside the hook
    const resource = asyncIdToResource[asyncId];
    // Only post event if resource and promise exist
    if (resource && resource.promise) {
         postEvent(Events.ResolvePromise(asyncId));
    }
    // No else block, so no warning is printed
};

console.log("[Worker] Enabling async_hooks.");
asyncHooks
  .createHook({ init, before, after, destroy, promiseResolve })
  .enable();
// --- End async_hooks setup move ---

// TODO: Maybe change this name to avoid conflicts?
const nextId = (() => {
  let id = 0;
  return () => id++;
})();

const arrToPrettyStr = (arr) =>
  arr.map(a => _.isString(a) ? a : prettyFormat(a)).join(' ') + '\n'

const START_TIME = Date.now();
const TIMEOUT_MILLIS = 5000;
const EVENT_LIMIT = 500;

const Tracer = {
  // Enhanced methods for event emission

  beforeCall: (callId, callSiteLine) => postEvent({
    type: "BeforeCall",
    payload: {
      callId,
      callSiteLine
    }
  }),

  enterFunc: (id, name, start, end, newScopeId, thisBinding, callSiteLine) => postEvent({
    type: "EnterFunction",
    payload: {
      id, name, start, end,
      newScopeId,
      thisBinding,
      callSiteLine
    }
  }),

  // --- MODIFIED exitFunc ---
  exitFunc: (id, name, start, end, exitingScopeId, returnValue, returnLine) => {
    let valuePayload;
    const valueType = typeof returnValue;

    if (valueType === 'function' || (valueType === 'object' && returnValue !== null)) {
        let heapId = objectToHeapId.get(returnValue);
        if (!heapId) {
            heapId = getNextHeapId();
            objectToHeapId.set(returnValue, heapId);
        }
        // Serialize and emit HEAP_UPDATE *before* ExitFunction
        const serializedValue = serializeForHeap(returnValue, heapId);
        postEvent(Events.HeapUpdate(heapId, serializedValue));

        valuePayload = { type: 'reference', heapId, valueType: valueType === 'function' ? 'function' : (Array.isArray(returnValue) ? 'array' : 'object') };
    } else {
        valuePayload = prettyFormat(returnValue); // Use prettyFormat for primitives/null
    }

    postEvent({
        type: "ExitFunction",
        payload: {
            id, name, start, end, exitingScopeId,
            returnValue: valuePayload, // Send reference or formatted primitive
            returnLine
        }
    });
  },
  // --- END MODIFIED exitFunc ---

  errorFunc: (message, id, name, start, end) => postEvent({
    type: "ErrorFunction",
    payload: { message, id, name, start, end }
  }),

  log: (...args) => postEvent({ type: "ConsoleLog", payload: { text: arrToPrettyStr(args) } }),
  warn: (...args) => postEvent({ type: "ConsoleWarn", payload: { text: arrToPrettyStr(args) } }),
  error: (...args) => postEvent({ type: "ConsoleError", payload: { text: arrToPrettyStr(args) } }),

  // Enhanced step event
  step: (line, col, snippet, statementType) => postEvent({
    type: "Step",
    payload: { line, col, snippet, statementType }
  }),

  // Enhanced scope tracking
  _currentLocals: {},
  captureLocals: (scopeId, parentId, locals) => {
    Tracer._currentLocals = locals;
    postEvent({
      type: "Locals",
      payload: { scopeId, parentId, locals }
    });
  },

  // Enhanced variable tracking
  // --- *** MODIFIED varWrite *** ---
  varWrite: (scopeId, name, val, valueTypeFromPlugin, line) => {
    console.log(`[Tracer.varWrite] Received: scopeId=${scopeId}, name=${name}, valueTypeFromPlugin=${valueTypeFromPlugin}, line=${line}, typeof val=${typeof val}`);

    let valuePayload;
    const actualValueType = typeof val;
    let finalValueType = valueTypeFromPlugin; // Start with plugin's guess

    // Handle Heap Objects/Functions/Arrays
    if (actualValueType === 'function' || (actualValueType === 'object' && val !== null)) {
        let heapId = objectToHeapId.get(val);
        if (!heapId) {
            heapId = getNextHeapId();
            objectToHeapId.set(val, heapId);
            console.log(`[Tracer.varWrite] Assigned new heapId ${heapId} to ${name}`);
        } else {
             console.log(`[Tracer.varWrite] Found existing heapId ${heapId} for ${name}`);
        }

        // Serialize and emit HEAP_UPDATE event
        const serializedValue = serializeForHeap(val, heapId); // This also updates heapRegistry
        postEvent(Events.HeapUpdate(heapId, serializedValue)); // Use event creator

        // Determine specific type for reference
        if (actualValueType === 'function') {
            finalValueType = 'function';
        } else if (Array.isArray(val)) {
            finalValueType = 'array';
        } else {
            finalValueType = 'object';
        }

        // Create reference payload for VarWrite
        valuePayload = { type: 'reference', heapId, valueType: finalValueType };
        console.log(`[Tracer.varWrite] Emitting HEAP_UPDATE (${heapId}) and VarWrite reference for ${name}`);

    } else {
        // Handle Primitives, null, undefined
        finalValueType = actualValueType; // Use actual type for primitives
        if (val === null) finalValueType = 'null';
        if (val === undefined) finalValueType = 'undefined';

        // Use prettyFormat only if not a simple string/number/boolean? Or just send raw?
        valuePayload = val;
        console.log(`[Tracer.varWrite] Emitting VarWrite with primitive value for ${name}`);
    }

    // Emit the VarWrite event
    postEvent({
        type: "VarWrite",
        payload: {
            scopeId,
            name,
            val: valuePayload, // Use the determined payload (reference or primitive)
            valueType: finalValueType, // Use the refined value type
            line
        }
    });

    return val; // <<< IMPORTANT: Always return the original value
  },
  // --- *** END MODIFIED varWrite *** ---
  varRead: (name, val) => {
    postEvent({
      type: "VarRead",
      payload: { name, val: prettyFormat(val) }
    });
    return val;
  },

  // Enhanced closure capture
  captureClosure: (closureId, parentId, bindings) => {
console.log('[Worker Tracer.captureClosure] Called with closureId:', closureId, 'parentId:', parentId, 'bindings:', bindings);
    const displayBindings = {};
    for (const key in bindings) {
      displayBindings[key] = prettyFormat(bindings[key]);
    }
console.log('[Worker Tracer.captureClosure] Posting Closure event:', { type: 'Closure', payload: { closureId, parentId, bindings: displayBindings } });
    postEvent({
      type: "Closure",
      payload: { closureId, parentId, bindings: displayBindings }
    });
  },

  // Loop termination check
  iterateLoop: () => {
    const hasTimedOut = (Date.now() - START_TIME) > TIMEOUT_MILLIS;
    const reachedEventLimit = events.length >= EVENT_LIMIT;
    const shouldTerminate = reachedEventLimit || hasTimedOut;
    if (shouldTerminate) {
      postEvent({
        type: "EarlyTermination",
        payload: {
          reason: hasTimedOut
            ? `Terminated early: Timeout of ${TIMEOUT_MILLIS} millis exceeded.`
            : `Terminated early: Event limit of ${EVENT_LIMIT} exceeded.`
        }
      });
      process.exit(1);
    }
  },
};

// E.g. call stack size exceeded errors...
process.on('uncaughtException', (err) => {
  postEvent(Events.UncaughtError(err));
  process.exit(1);
});

// Add safety check for Tracer methods if needed
if (typeof Tracer.enterFunc !== 'function' || typeof Tracer.exitFunc !== 'function' || typeof Tracer.errorFunc !== 'function') {
  throw new Error("Tracer object is missing required function tracing methods!");
}

const vm = new VM({
  timeout: 6000, // Keep existing timeout
  sandbox: {
    nextId,
    ...Tracer, // Spread individual methods for direct access
    Tracer, // Also expose full Tracer object
    fetch,
    _,
    lodash: _,
    setTimeout,
    queueMicrotask,
    prettyFormat,
    console: {
      log: (...args) => Tracer.log(...args),
      warn: (...args) => Tracer.warn(...args),
      error: (...args) => Tracer.error(...args),
    },
  },
});

try {
  console.log("Running instrumented code in VM..."); // Add log
  vm.run(modifiedSource);
  console.log("VM execution finished."); // Add log
} catch (vmError) {
  console.error("Error during VM execution:", vmError); // Log VM errors caught here
  // Post an error event if VM itself throws (e.g., timeout, compilation)
  postEvent(Events.UncaughtError(vmError));
// Optionally re-throw or exit depending on desired worker behavior on VM errors
// process.exit(1);
}
