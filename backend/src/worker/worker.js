const { parentPort, workerData } = require('worker_threads');
const asyncHooks = require('async_hooks');
const util = require('util');
const fs = require('fs');
const babel = require('babel-core');
const { VM } = require('vm2');

const fetch = require('node-fetch');
const _ = require('lodash');
// Falafel removed
const prettyFormat = require('pretty-format');

const { traceLoops } = require('./loopTracer');
const traceLines = require('./traceLines');
const traceScopeAndClosures = require('./traceScopeAndClosures');
const traceFunctions = require('./traceFunctions'); // Require the new plugin

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

const eid = asyncHooks.executionAsyncId();
const tid = asyncHooks.triggerAsyncId();

const asyncIdToResource = {};

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
}

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
}

const after = (asyncId) => {
  const resource = asyncIdToResource[asyncId] || {};
  const resourceName = (resource.constructor).name;
  if (resourceName === 'PromiseWrap') {
    postEvent(Events.AfterPromise(asyncId));
  }
  if (resourceName === 'AsyncResource') {
    postEvent(Events.AfterMicrotask(asyncId));
  }
}

const destroy = (asyncId) => {
  const resource = asyncIdToResource[asyncId] || {};
}

const promiseResolve = (asyncId) => {
  const promise = asyncIdToResource[asyncId].promise;
  postEvent(Events.ResolvePromise(asyncId));
}

asyncHooks
  .createHook({ init, before, after, destroy, promiseResolve })
  .enable();

const functionDefinitionTypes = [
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
];
const arrowFnImplicitReturnTypesRegex = /Literal|Identifier|(\w)*Expression/;

// traceBlock function removed (was Falafel-specific)

const jsSourceCode = workerData; // Keep the original source untouched

// Falafel transformation block removed

// --- Run Babel ---
let modifiedSource = '';
try {
  console.log("Starting Babel transformation..."); // Add log
  modifiedSource = babel
    .transform(jsSourceCode, { // Use original jsSourceCode here
      filename: 'userCode.js', // Optional: Good practice for sourcemaps/errors
      sourceMaps: false,      // Keep false for now unless you plan to use them
      plugins: [
        // Order matters!
        traceLoops,           // Handles loops first
        // Pass original source needed by traceLines
        [traceLines, { originalSource: jsSourceCode }],
        traceScopeAndClosures,// Handles scope, closures, vars next // Re-enabled
        traceFunctions,       // Wraps functions last <<-- CORRECTED ORDER // Re-enabled
      ]
    })
    .code;
  console.log("Babel transformation complete."); // Add log
  // Optional: Log transformed code for debugging
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
  // Existing methods
  enterFunc: (id, name, start, end) => postEvent(Events.EnterFunction(id, name, start, end)),
  exitFunc: (id, name, start, end) => postEvent(Events.ExitFunction(id, name, start, end)),
  errorFunc: (message, id, name, start, end) => postEvent(Events.ErrorFunction(message, id, name, start, end)),
  log: (...args) => postEvent(Events.ConsoleLog(arrToPrettyStr(args))),
  warn: (...args) => postEvent(Events.ConsoleWarn(arrToPrettyStr(args))),
  error: (...args) => postEvent(Events.ConsoleError(arrToPrettyStr(args))),
  
  // New methods for line stepping
  step: (line, col, snippet) => postEvent({
    type: "Step",
    payload: { line, col, snippet }
  }),
  
  // Methods for scope tracking
  _currentLocals: {},
  captureLocals: (locals) => {
    Tracer._currentLocals = locals;
    postEvent({
      type: "Locals",
      payload: locals
    });
  },
  
  // Methods for variable tracking
  varWrite: (name, val) => postEvent({
    type: "VarWrite",
    payload: { name, val: prettyFormat(val) }
  }),
  
  varRead: (name, val) => postEvent({
    type: "VarRead",
    payload: { name, val: prettyFormat(val) }
  }),
  
  // Method for closure capture
  captureClosure: (fnId, bindings) => {
    const displayBindings = {};
    for (const key in bindings) {
      displayBindings[key] = prettyFormat(bindings[key]);
    }
    postEvent({
      type: "Closure",
      payload: { fnId, bindings: displayBindings }
    });
  },
  
  // Loop termination check
  iterateLoop: () => {
    const hasTimedOut = (Date.now() - START_TIME) > TIMEOUT_MILLIS;
    const reachedEventLimit = events.length >= EVENT_LIMIT;
    const shouldTerminate = reachedEventLimit || hasTimedOut;
    if (shouldTerminate) {
      postEvent(Events.EarlyTermination(hasTimedOut
        ? `Terminated early: Timeout of ${TIMEOUT_MILLIS} millis exceeded.`
        : `Terminated early: Event limit of ${EVENT_LIMIT} exceeded.`
      ));
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
    Tracer,
    fetch,
    _,
    lodash: _,
    setTimeout,
    queueMicrotask,
    console: {
      log: Tracer.log,
      warn: Tracer.warn,
      error: Tracer.error,
    },
  },
});

try {
    console.log("Running instrumented code in VM..."); // Add log
    vm.run(modifiedSource);
    console.log("VM execution finished."); // Add log
} catch(vmError) {
    console.error("Error during VM execution:", vmError); // Log VM errors caught here
    // Post an error event if VM itself throws (e.g., timeout, compilation)
    postEvent(Events.UncaughtError(vmError));
    // Optionally re-throw or exit depending on desired worker behavior on VM errors
    // process.exit(1);
}
