const babel = require('@babel/core');
const fs = require('fs');
const path = require('path');
const vm = require('vm'); // Add vm module
const prettyFormat = require('pretty-format').default; // For formatting values in Tracer

// Import the plugins (adjust paths if necessary, assuming run_test.js is in backend/test/)
const { traceScopePlugin: traceScope } = require('../src/worker/traceScope'); // Destructure the plugin function
const traceFunctions = require('../src/worker/traceFunctions');
const { traceVariablesPlugin: traceVariables } = require('../src/worker/traceVariables'); // Destructure the plugin
const traceLines = require('../src/worker/traceLines');
// preserveLoc might be needed depending on the exact setup, include it for safety
const preserveLoc = require('../src/worker/preserveLoc');
const { storyReducer, initialState: initialStoryState } = require('../src/main/storyReducer'); // Import storyReducer

const testFilePath = path.join(__dirname, 'temp_counter_test.js');

try {
  const codeContent = fs.readFileSync(testFilePath, 'utf8');
  console.log(`Read test file: ${testFilePath}`);
  console.log('--- Original Code ---');
  console.log(codeContent);
  console.log('---------------------\n');

  console.log('Applying Babel transformations...');

  // Define the plugin pipeline in the correct order
  const babelOptions = {
    plugins: [
      // preserveLoc should ideally run first if needed to store original locations
      preserveLoc,
      traceScope,
      traceVariables, // Use the modified version
      traceFunctions,
      [traceLines, { originalSource: codeContent }], // Pass original source to traceLines
    ],
    ast: true, // Request the AST to be generated
    generatorOpts: { // Optional: Improve readability of generated code
        retainLines: false,
        compact: false,
        concise: false,
        comments: true, // Keep comments if any were added/preserved
    }
  };

  // Perform the transformation
  const result = babel.transformSync(codeContent, babelOptions);

  console.log('--- Final Generated Code ---');
  console.log(result.code);
  console.log('--------------------------\n');

  console.log('--- Final AST ---');
  // Pretty print the AST object
  console.log(JSON.stringify(result.ast, null, 2));
  console.log('-----------------\n');

  console.log('Transformation complete. Final code and AST printed above.');
  
    // --- Execute the transformed code ---
    console.log('\nExecuting transformed code...');
  
    const nextId = (() => {
      let id = 0;
      return () => id++;
    })();
  
    const eventsLog = []; // Store events for verification
  
    const Tracer = {
      // Simple console logging tracer for verification
      logEvent: (type, payload) => {
        const event = { type, payload };
        eventsLog.push(event); // Store the event
        // Log specific events relevant to the verification steps
        if (['EnterFunction', 'ExitFunction', 'VarWrite', 'Closure', 'Locals', 'Step', 'ErrorFunction'].includes(type)) {
           console.log(`[Tracer Event] ${type}:`, JSON.stringify(payload, (key, value) =>
             typeof value === 'function' ? '[Function]' : value // Avoid logging full functions
           , 2));
        }
      },
      enterFunc: (id, name, start, end, newScopeId, thisBinding, callSiteLine) => Tracer.logEvent('EnterFunction', { id, name, start, end, newScopeId, thisBinding, callSiteLine }),
      exitFunc: (id, name, start, end, exitingScopeId, returnValue, returnLine) => Tracer.logEvent('ExitFunction', { id, name, start, end, exitingScopeId, returnValue: prettyFormat(returnValue), returnLine }), // Use prettyFormat
      errorFunc: (message, id, name, start, end) => Tracer.logEvent('ErrorFunction', { message, id, name, start, end }),
      log: (...args) => Tracer.logEvent('ConsoleLog', { text: args.map(a => prettyFormat(a)).join(' ') }),
      warn: (...args) => Tracer.logEvent('ConsoleWarn', { text: args.map(a => prettyFormat(a)).join(' ') }),
      error: (...args) => Tracer.logEvent('ConsoleError', { text: args.map(a => prettyFormat(a)).join(' ') }),
      step: (line, col, snippet, statementType) => Tracer.logEvent('Step', { line, col, snippet, statementType }),
      captureLocals: (scopeId, parentId, locals) => {
          const formattedLocals = {};
          for(const key in locals) {
              formattedLocals[key] = prettyFormat(locals[key]);
          }
          Tracer.logEvent('Locals', { scopeId, parentId, locals: formattedLocals });
      },
      varWrite: (scopeId, name, val, valueType, line) => { // Added line
          Tracer.logEvent('VarWrite', { scopeId, name, val: prettyFormat(val), valueType, line }); // Use prettyFormat
          return val; // Important: return the value
      },
      varRead: (name, val) => {
          // Not strictly needed for this verification, but good to have
          // Tracer.logEvent('VarRead', { name, val: prettyFormat(val) });
          return val; // Important: return the value
      },
      captureClosure: (closureId, parentId, bindings) => {
          const displayBindings = {};
          for (const key in bindings) {
            displayBindings[key] = prettyFormat(bindings[key]); // Use prettyFormat
          }
          Tracer.logEvent('Closure', { closureId, parentId, bindings: displayBindings });
      },
      iterateLoop: () => { /* No-op for this test */ }, // Add dummy iterateLoop
    beforeCall: () => { /* No-op for test runner */ },
    };
  
    const sandbox = {
      nextId,
      Tracer,
      console: { // Redirect console inside VM to Tracer
          log: Tracer.log,
          warn: Tracer.warn,
          error: Tracer.error,
      },
      // Add other globals if the test code needs them (e.g., setTimeout)
      setTimeout,
      queueMicrotask,
      prettyFormat, // Make available if needed by instrumented code itself
    };
  
    try {
      vm.runInNewContext(result.code, sandbox);
      console.log('Execution finished.');
      // Optional: Print all captured events at the end
      // console.log('\n--- All Captured Events ---');
      // console.log(JSON.stringify(eventsLog, null, 2));
      // console.log('--------------------------');
    } catch (runtimeError) {
      console.error('\n--- Runtime Error ---');
      console.error(runtimeError);
      console.error('---------------------\n');
      // Log the error event via Tracer if possible
      Tracer.logEvent('UncaughtError', {
          name: runtimeError.name,
          message: runtimeError.message,
          stack: runtimeError.stack
      });
    }

    // --- Process events with storyReducer ---
    console.log('\nProcessing events with storyReducer...');
    let finalStoryList;
    try {
        // Call storyReducer once with the initial state and the full events log
        finalStoryList = storyReducer(initialStoryState, eventsLog);
        console.log('--- Final STORY_LIST ---');
        console.log(JSON.stringify(finalStoryList, null, 2));
        console.log('------------------------');
    } catch (reducerError) {
        console.error('\n--- Error during storyReducer processing ---');
        console.error(reducerError);
        console.error('------------------------------------------\n');
    }


  } catch (err) {
    console.error(`Error during Babel transformation, file reading, or execution: ${err}`);
  console.error(err.stack); // Print stack trace for better debugging
  process.exit(1);
}

// process.exit(0); // Comment out to see async logs if any
