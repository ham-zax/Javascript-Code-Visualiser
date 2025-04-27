// src/worker/traceLines.js
const ALREADY    = Symbol('instrumented');
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

module.exports = function traceLines({ types: t }) {
  // const SKIP = Symbol("skipLineTrace"); // Remove old symbol

  return {
    visitor: {
      Statement(path) {
        // 1) don’t re-instrument nodes we already tagged
        // if (path.node[SKIP]) return; // Use new symbol
        if (path.node[ALREADY]) return;

        // Check if the statement is a call to a skipped name
        if (path.isExpressionStatement() && path.get('expression').isCallExpression()) {
          const callee = path.get('expression.callee');
          if (callee.isIdentifier() && SKIP_NAMES.has(callee.node.name)) {
            return;
          }
          if (callee.isMemberExpression() && callee.get('object').isIdentifier() && SKIP_NAMES.has(callee.get('object').node.name)) {
            return;
          }
        }


        // 2) ensure we have location info
        const loc = path.node.loc;
        if (!loc || !loc.start) return;

        // 3) build the Tracer.step call
        const { line, column } = loc.start;
        const snippet = path
          .getSource()
          .replace(/\r?\n/g, " ")
          .trim();
        const call = t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.identifier("Tracer"), t.identifier("step")),
            [
              t.numericLiteral(line),
              t.numericLiteral(column),
              t.stringLiteral(snippet),
            ]
          )
        );
        // tag it so we never revisit it
        // call[SKIP] = true; // Use new symbol
        call[ALREADY] = true;

        // 4) insert before the real statement
        path.insertBefore(call);

        // 5) skip traversing *into* our new call
        path.skip();
      }
    }
  };
};