const babel = require('@babel/core');
const fs = require('fs');
const path = require('path');

// Import the plugins (adjust paths if necessary, assuming run_test.js is in backend/test/)
const { traceScopePlugin: traceScope } = require('../src/worker/traceScope'); // Destructure the plugin function
const traceFunctions = require('../src/worker/traceFunctions');
const { traceVariablesPlugin: traceVariables } = require('../src/worker/traceVariables'); // Destructure the plugin
const traceLines = require('../src/worker/traceLines');
// preserveLoc might be needed depending on the exact setup, include it for safety
const preserveLoc = require('../src/worker/preserveLoc');

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
      traceLines,
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

} catch (err) {
  console.error(`Error during Babel transformation or file reading: ${err}`);
  console.error(err.stack); // Print stack trace for better debugging
  process.exit(1);
}

process.exit(0); // Exit cleanly
