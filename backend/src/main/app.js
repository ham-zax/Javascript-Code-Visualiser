const WebSocket = require('ws');
const { launchWorker } = require('./launchWorker');
const { reduceEvents } = require('./eventsReducer'); // Import reduceEvents
const { storyReducer } = require('./storyReducer'); // Import Story reducer

// Heroku provides a PORT env var that we have to use
const port = process.env.PORT || 8080;

// Add callback to confirm listening and error handler for server instance
const wss = new WebSocket.Server({ port }, () => {
  console.log(`WebSocket server started and listening on port ${port}`);
});

wss.on('error', (error) => {
  // Log errors originating from the WebSocket server itself
  console.error('WebSocket Server Error:', error);
});

console.log('Initializing WebSocket server...'); // Log before server setup

// Control message types
const Messages = {
  RUN_CODE: 'RUN_CODE',
  STEP_OVER: 'STEP_OVER',
  RESUME: 'RESUME',
  STOP: 'STOP',
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  SET_SPEED: 'SET_SPEED',
  SEEK: 'SEEK',
};

// In-memory session store: ws -> { worker, events }
const sessions = new Map();

wss.on('connection', (ws, req) => { // Add req to log client IP if needed
  // Log when a connection is established
  const clientIp = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : 'Unknown IP';
  console.log(`Client connected from ${clientIp}`);

  // Initialize session state
sessions.set(ws, { worker: null, events: [] }); // Add events array to session
  // Set up heartbeat for this connection
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', async (message) => {
    console.log(`Received from ${clientIp}:`, message.toString()); // Log message content as string
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(message);
    } catch (parseError) {
      console.error(`Failed to parse message from ${clientIp}:`, parseError);
      // Optionally send error back to client
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Invalid JSON message received.' } }));
      }
      return;
    }

    const { type, payload } = parsedMessage;
    const session = sessions.get(ws);

    if (!session) {
      console.error(`Session not found for WebSocket from ${clientIp}.`);
      return; // Should not happen ideally
    }

    if (type === Messages.RUN_CODE) {
      console.log(`RUN_CODE request from ${clientIp}`);
      // Terminate existing worker if any
      if (session.worker) {
        console.log(`Terminating previous worker for session ${clientIp}.`);
        session.worker.terminate();
      }
      // Reset events for the new run
      session.events = [];

      // Spawn worker thread using Node.js worker_threads
      session.worker = launchWorker(payload.code, async (evtString) => {
        try {
          const evt = JSON.parse(evtString);

          // Accumulate all events from the worker
          session.events.push(evt);

          // Check if the worker is done
          if (evt.type === 'Done') {
            console.log(`Worker for ${clientIp} finished. Reducing events...`);
            // Reduce the collected events to raw events and story events
            const reducedEvents = reduceEvents(session.events);
            const storyEvents = storyReducer(reducedEvents);
            console.log(`Sending STORY_LIST to ${clientIp} with ${storyEvents.length} events.`);
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: 'STORY_LIST', payload: storyEvents }));
                // Backward compatibility: also send old EVENT_LIST
                ws.send(JSON.stringify({ type: 'EVENT_LIST', payload: reducedEvents }));
              } catch (sendError) {
                console.error(`Error sending events to ${clientIp}:`, sendError);
              }
            }
            session.worker = null; // Clear worker reference
          } else if (evt.type === 'UncaughtError') {
             console.error(`Worker UncaughtError for ${clientIp}:`, evt.payload.error);
             if (ws.readyState === WebSocket.OPEN) {
               try {
                 ws.send(JSON.stringify({ type: 'EXECUTION_ERROR', payload: { message: evt.payload.error?.message || 'Unknown worker error' } }));
               } catch (sendError) {
                 console.error(`Error sending EXECUTION_ERROR to ${clientIp}:`, sendError);
               }
             }
          }
        } catch (error) { // Catch errors in event processing/reducing
          console.error(`Error processing worker event or reducing for ${clientIp}:`, error);
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'EXECUTION_ERROR', payload: { message: `Backend Error: ${error.message}` } }));
            } catch (sendError) {
              console.error(`Error sending Backend Error message to ${clientIp}:`, sendError);
            }
          }
          if (session.worker) session.worker.terminate();
          sessions.delete(ws); // Remove session on error
        }
      });

    } else if (type === Messages.STOP) {
      console.log(`STOP received from ${clientIp}. Terminating worker.`);
      if (session.worker) {
        session.worker.terminate();
        session.worker = null;
      }
      session.events = [];
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`Client ${clientIp} disconnected. Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}. Cleaning up session.`);
    const session = sessions.get(ws);
    if (session && session.worker) {
      session.worker.terminate();
    }
    sessions.delete(ws);
  });

  ws.on('error', (error) => {
    // Log errors specific to this client connection
    console.error(`WebSocket connection error for ${clientIp}:`, error);
    const session = sessions.get(ws);
    if (session && session.worker) {
      session.worker.terminate();
    }
    sessions.delete(ws); // Clean up on WS error too
  });
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 10000);

wss.on('close', () => {
  clearInterval(interval);
});
