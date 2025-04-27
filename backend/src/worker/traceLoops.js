// backend/src/worker/loopTracer.js (Revised)
const traceLoops = (babel) => {
  const t = babel.types;
  // Use a symbol specific to this plugin or reuse a shared one if appropriate
  const LOOP_TRACED = Symbol("loopTraced");

  const transformLoop = (path) => {
    // Prevent double instrumentation if plugin runs multiple times for any reason
    if (path.node[LOOP_TRACED]) return;

    // --- Create the Tracer.iterateLoop() call ---
    const iterateLoop = t.memberExpression(
      t.identifier('Tracer'),
      t.identifier('iterateLoop'),
    );
    const callIterateLoop = t.callExpression(iterateLoop, []);
    const callStatement = t.expressionStatement(callIterateLoop);
    // Mark the *call statement itself* so traceLines ignores it if needed
    // (Using a shared symbol like 'ALREADY' from traceLines might be better)
    // callStatement[ALREADY] = true; // Assuming ALREADY is defined/imported if used


    // --- Ensure the loop body is a BlockStatement ---
    let bodyPath = path.get('body');
    if (!bodyPath.isBlockStatement()) {
      // If body exists but isn't a block, wrap it
      if (bodyPath.node) {
        bodyPath.replaceWith(t.blockStatement([bodyPath.node]));
      } else {
        // Handle loops with empty bodies (e.g., for(;;);)
        // Replace the non-existent body path with an empty block
        bodyPath.replaceWith(t.blockStatement([]));
      }
      // IMPORTANT: Re-fetch the bodyPath after replacing it
      bodyPath = path.get('body');
    }

    // --- Add the tracing call to the end of the BlockStatement body ---
    // We now know bodyPath definitely points to a BlockStatement
    bodyPath.pushContainer('body', callStatement);

    // Mark the original loop node as processed by this plugin
    path.node[LOOP_TRACED] = true;
  };

  return {
    visitor: {
      // Use Babel's "Loop" shorthand to visit all loop types
      "Loop": transformLoop,
      // Or list them individually if needed:
      // WhileStatement: transformLoop,
      // DoWhileStatement: transformLoop,
      // ForStatement: transformLoop,
      // ForInStatement: transformLoop,
      // ForOfStatement: transformLoop,
    }
  };
};

module.exports = { traceLoops }; // Make sure to export correctly