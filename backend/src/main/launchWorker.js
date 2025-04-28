console.debug('[DEBUG] launchWorker.js loaded');
// backend/src/main/launchWorker.js
const { Worker } = require('worker_threads');
const path = require('path');
const WORKER_FILE = path.resolve(__dirname, '../worker/worker.js'); // Absolute path for worker

/**
 * onEvent will be called with a JSON-stringified event from the worker,
 * matching the structure: { type: 'ConsoleLog' | 'UncaughtError' | 'Done', payload: {...} }
 */
const launchWorker = (jsSourceCode, onEvent) => {
  const worker = new Worker(WORKER_FILE, {
    workerData: jsSourceCode, // Pass the code string directly
  });

  // Forward raw event JSON messages from worker
  worker.on('message', (message) => {
    // message is already JSON stringified in worker.js
    onEvent(message);
  });

  // Handle worker errors
  worker.on('error', (err) => {
    const errorEvent = JSON.stringify({
      type: 'UncaughtError',
      payload: { name: err.name, message: err.message, stack: err.stack }
    });
    onEvent(errorEvent);
  });

  // Handle worker exit
  worker.on('exit', (code) => {
    const doneEvent = JSON.stringify({
      type: 'Done',
      payload: { exitCode: code }
    });
    onEvent(doneEvent);
  });

  return worker;
};

module.exports = { launchWorker };
