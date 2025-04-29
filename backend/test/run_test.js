const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// const testFilePath = path.join(__dirname, 'tdz_test.js');
const serverUrl = 'ws://localhost:8080/ws'; // Default port with WS path

try {
  // const codeContent = fs.readFileSync(testFilePath, 'utf8');
  // console.log(`Read test file: ${testFilePath}`);

  const codeContent = `function createCounter() {
    let count = 0;
    return function() {
      count++;
      console.log(count);
    };
  }

  const myCounter = createCounter();

  myCounter(); // Output: 1
  myCounter(); // Output: 2`;
  console.log('Using hardcoded createCounter test code.');

  const ws = new WebSocket(serverUrl);

  ws.on('open', () => {
    console.log(`Connected to WebSocket server at ${serverUrl}`);
    const message = {
      type: 'RUN_CODE',
      payload: {
        code: codeContent
      }
    };
    console.log('Sending RUN_CODE message...');
    ws.send(JSON.stringify(message));
  });

  ws.on('message', (data) => {
    console.log('Received from server:');
    try {
      const parsedData = JSON.parse(data);
      console.log(JSON.stringify(parsedData, null, 2)); // Pretty print JSON

      // Close connection after receiving the expected list or an error
      if (parsedData.type === 'STORY_LIST' || parsedData.type === 'EVENT_LIST' || parsedData.type === 'EXECUTION_ERROR') {
        console.log('Received final response. Closing connection.');
        ws.close();
      }
    } catch (e) {
      console.log(data.toString()); // Print raw data if not JSON
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`WebSocket connection closed. Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}`);
    process.exit(0); // Exit script cleanly
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    process.exit(1); // Exit script with error code
  });

} catch (err) {
  console.error(`Error reading test file or setting up test runner: ${err}`);
  process.exit(1);
}
