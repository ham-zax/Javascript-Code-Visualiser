// backend/src/worker/traceLines.js

const ALREADY    = Symbol('instrumented'); // Keep original ALREADY for general skip
const SKIP_NAMES = new Set([
  'Tracer',
  'nextId',
  'fetch',
  '_',
  'lodash',
  'console',
  'setTimeout',
  'queueMicrotask'
]);

module.exports = function traceLines({ types: t }, options = {}) {
  const originalSource = options.originalSource;
  const originalLines = originalSource ? originalSource.split('\n') : null;
  // Use a symbol specific to this plugin to prevent double-adding steps
  const STEP_ADDED = Symbol("stepAdded");

  return {
    visitor: {
      Statement(path) {
        // Log ALL statements being visited initially for debugging
        console.log(`[traceLines] Visiting ${path.type} at L${path.node.loc?.start?.line || '?'}`);

        // Skip function declarations
        if (path.isFunctionDeclaration()) {
          console.log(`[traceLines] Skipping FunctionDeclaration.`);
          return;
        }

        // Prevent double instrumentation
        if (path.node[STEP_ADDED]) {
          console.log(`[traceLines] Skipping already instrumented node at L${path.node.loc?.start?.line || '?'}`);
          return;
        }

        // Check specifically for the hello("World") call
        let isHelloCall = false;
        if (path.isExpressionStatement()) {
             const expr = path.get('expression');
             if (expr.isCallExpression() && expr.get('callee').isIdentifier({ name: 'hello' })) {
                 isHelloCall = true;
                 console.log(`[traceLines] >>> Found hello("World") call statement <<<`);
             }
        }

        // Skip internal calls (check before loc)
        if (path.isExpressionStatement() && path.get('expression').isCallExpression()) {
          const callee = path.get('expression.callee'); // Define callee here
          if (callee.isIdentifier() && SKIP_NAMES.has(callee.node.name)) { // Check if callee is defined
             console.log(`[traceLines] Skipping internal call statement (direct).`);
             return;
          }
          if (callee.isMemberExpression() && callee.get('object').isIdentifier() && SKIP_NAMES.has(callee.get('object').node.name)) { // Check if callee is defined
             console.log(`[traceLines] Skipping internal call statement (member).`);
             return;
          }
        }

        // Get location info
        const loc = path.node.loc;
        if (!loc || !loc.start || !originalLines) {
           console.log(`[traceLines] Skipping node at L${loc?.start?.line || '?'} due to missing loc/originalLines.`);
          return;
        }
        // Get snippet as before
        const { line, column } = loc.start;
        const lineIndex = line - 1;
        let originalSnippet = "[Snippet Error]";
        if (lineIndex >= 0 && lineIndex < originalLines.length) {
          originalSnippet = originalLines[lineIndex].trim();
        } else {
          console.warn(`[traceLines] Line number ${line} out of bounds for originalLines. Using fallback snippet.`);
          try {
            originalSnippet = path.getSource().replace(/\r?\n/g, " ").trim();
          } catch (getSourceError) {
            console.warn(`[traceLines] Failed to get source snippet for L${line}: ${getSourceError.message}`);
            originalSnippet = "[source unavailable]";
          }
        }


        // Create the Tracer.step call statement
        const callStatement = t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.identifier("Tracer"), t.identifier("step")),
            [
              t.numericLiteral(line),
              t.numericLiteral(column),
              t.stringLiteral(originalSnippet),
            ]
          )
        );
        callStatement[STEP_ADDED] = true; // Mark the call itself
        callStatement[ALREADY] = true; // Also use general symbol


        // --- Insertion Logic ---
        console.log(`[traceLines] Preparing insertBefore for ${path.type} at L${line}: "${originalSnippet}". Parent: ${path.parent.type}`);

        if (!path.key || path.listKey === undefined || !path.parentPath || !path.inList) { // Check listKey for undefined specifically
             console.warn(`[traceLines] Cannot insert before ${path.type} at L${line} - Invalid path context (key: ${path.key}, listKey: ${path.listKey}, inList: ${path.inList}). Skipping step.`);
             return;
        }

        try {
          path.insertBefore(callStatement);
          console.log(`[traceLines] Inserted step successfully for L${line}.`);
        } catch (e) {
          console.error(`[traceLines] !!!!! ERROR during insertBefore !!!!! for ${path.type} at L${line}. Parent: ${path.parent.type}`, e);
          return;
        }

        // Mark the original statement node *after* successful insertion
        path.node[STEP_ADDED] = true;
        path.node[ALREADY] = true; // Also use general symbol

        // Skip children of the original statement
        path.skip(); // Re-enable skip as it's generally needed after successful insertion
      }
    }
  };
};
