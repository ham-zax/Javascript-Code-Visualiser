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

// Heap object tracking infrastructure
const heapRegistry = {};
const objectToHeapId = new WeakMap();
let nextHeapId = 1;

function getNextHeapId() {
  return 'h' + (nextHeapId++);
}

// Depth-limited, circular-safe serializer for heap objects/arrays
function serializeForHeap(target, depth = 0, maxDepth = 2, visited = new WeakSet()) {
  if (target === null) return null;
  if (typeof target !== 'object') return target;
  if (visited.has(target)) return { type: 'circular', heapId: objectToHeapId.get(target) || null };

  visited.add(target);

  // Assign heapId if not already assigned
  let heapId = objectToHeapId.get(target);
  if (!heapId) {
    heapId = getNextHeapId();
    objectToHeapId.set(target, heapId);
  }

  if (Array.isArray(target)) {
    if (depth >= maxDepth) return { type: 'array', heapId };
    return {
      type: 'array',
      heapId,
      elements: target.map(v => serializeForHeap(v, depth + 1, maxDepth, visited))
    };
  } else {
    if (depth >= maxDepth) return { type: 'object', heapId };
    const out = {};
    for (const k of Object.keys(target)) {
      try {
        out[k] = serializeForHeap(target[k], depth + 1, maxDepth, visited);
      } catch (e) {
        out[k] = '[Unserializable]';
      }
    }
    return {
      type: 'object',
      heapId,
      properties: out
    };
  }
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

  // New events for enhanced tracing
  Step: (line, col, snippet) => event('Step', { line, col, snippet }),
  Locals: (locals) => event('Locals', { locals }),
  VarWrite: (name, value) => event('VarWrite', { name, value }),
  VarRead: (name, value) => event('VarRead', { name, value }),
  Closure: (fnId, bindings) => event('Closure', { fnId, bindings }),

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
  parentPort.postMessage(JSON.stringify(event));
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

  exitFunc: (id, name, start, end, exitingScopeId, returnValue, returnLine) => {
      // Format returnValue for consistent reporting
      const formattedReturnValue = prettyFormat(returnValue);
      console.log('[Worker Tracer.exitFunc] Formatted returnValue:', formattedReturnValue);
      postEvent({
        type: "ExitFunction",
        payload: {
          id,
          name,
          start,
          end,
      exitingScopeId, // revisit exitingScopeId correctness
      returnValue: formattedReturnValue,
      returnLine
      }
    });
  },

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
  varWrite: (scopeId, name, val, valueType, line) => { // Added 'line' parameter
    console.log(`[Tracer.varWrite] Called with: scopeId=${scopeId}, name=${name}, val=`, val, `, valueType=${valueType}, line=${line}`); // Log line

    // Detect heap objects/arrays (not null, not function)
    if (
      val !== null &&
      typeof val === 'object' &&
      (Array.isArray(val) || Object.prototype.toString.call(val) === '[object Object]')
    ) {
      // Assign heapId and serialize
      let heapId = objectToHeapId.get(val);
      if (!heapId) {
        heapId = getNextHeapId();
        objectToHeapId.set(val, heapId);
      }
      const serialized = serializeForHeap(val, 0, 2, new WeakSet());
      heapRegistry[heapId] = serialized;

      // Emit HEAP_UPDATE event
      postEvent({
        type: "HEAP_UPDATE",
        payload: {
          heapId,
          type: Array.isArray(val) ? 'array' : 'object',
          value: serialized
        }
      });

      // Emit VarWrite with reference
      postEvent({
        type: "VarWrite",
        payload: {
          scopeId,
          name,
          val: { type: 'reference', heapId, valueType },
          valueType,
          line // Include line in payload
        }
      });
      return val;
    }

    // For primitives/functions, emit as before
    postEvent({
      type: "VarWrite",
      payload: {
        scopeId,
        name,
        val: prettyFormat(val),
        valueType,
        line // Include line in payload
      }
    });
    return val;
  },
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
