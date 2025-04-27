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
        // Skip function declarations (handled by traceFunctions or not stepped on)
        if (path.isFunctionDeclaration()) {
          return;
        }

        // Prevent double instrumentation for this specific plugin
        // Also check the general ALREADY symbol in case other plugins marked it
        if (path.node[STEP_ADDED] || path.node[ALREADY]) return;

        // Skip internal calls (ensure SKIP_NAMES check is robust)
        if (path.isExpressionStatement() && path.get('expression').isCallExpression()) {
          const callee = path.get('expression.callee');
          if (callee.isIdentifier() && SKIP_NAMES.has(callee.node.name)) {
             // Don't add STEP_ADDED here, just return
            return;
          }
          if (callee.isMemberExpression() && callee.get('object').isIdentifier() && SKIP_NAMES.has(callee.get('object').node.name)) {
             // Don't add STEP_ADDED here, just return
            return;
          }
        }

        // Get location info
        const loc = path.node.loc;
        if (!loc || !loc.start || !originalLines) {
          // console.log(`[traceLines] Skipping node type ${path.type} due to missing loc/originalLines.`);
          return; // Need loc and original source
        }
        const { line, column } = loc.start;
        const lineIndex = line - 1;

        // Get snippet from original source
        let originalSnippet = "";
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
        // Mark the call statement itself to avoid instrumenting it
        callStatement[STEP_ADDED] = true; // Use plugin-specific symbol
        callStatement[ALREADY] = true; // Also use general symbol

        // 4) Attempt to insert before the real statement
        console.log(`[traceLines] Trying insertBefore for ${path.type} at L${line}: "${originalSnippet}". Parent: ${path.parent.type}`); // DETAILED LOG

        // Check if the path allows insertion in its current context
        if (!path.key || path.listKey === undefined || !path.parentPath || !path.inList) {
             console.warn(`[traceLines] Cannot insert before ${path.type} at L${line} - Invalid path context (key: ${path.key}, listKey: ${path.listKey}, inList: ${path.inList}). Skipping step.`);
             return; // Cannot insert here
        }

        try {
          path.insertBefore(callStatement); // LINE 70 (or near it)
          console.log(`[traceLines] Inserted step successfully for L${line}.`);
        } catch (e) {
          console.error(`[traceLines] !!!!! ERROR during insertBefore !!!!! for ${path.type} at L${line}. Parent: ${path.parent.type}`, e);
          // Optionally log more path details: console.error(path);
          return; // Stop processing this node if insertion fails
        }

        // Mark the original statement node *after* successful insertion
        path.node[STEP_ADDED] = true;
        path.node[ALREADY] = true; // Also use general symbol

        // Skip children of the original statement
        // path.skip(); // Let's comment this out temporarily to see if it affects anything downstream, though unlikely related to insertBefore error
      }
    }
  };
};
