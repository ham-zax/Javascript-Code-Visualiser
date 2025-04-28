// backend/src/worker/traceScope.js
module.exports = function traceScope({ types: t }) {
  const ALREADY = Symbol("scopeInstrumented");
  const SKIP_NAMES = new Set([
    "Tracer", "nextId", "console",
    "arguments", "this",       // skip built-ins
    "_", "lodash", "fetch"
  ]);

  return {
    visitor: {
      Function(path) {
        // --- guard: only instrument once ---
        if (path.node[ALREADY]) return;
        path.node[ALREADY] = true;

        // --- 1) Capture parameters at function entry ---
        const params = path.node.params
          .filter(p => t.isIdentifier(p))
          .map(p => p.name);

        const paramsObjectProps = params.map(name =>
          t.objectProperty(t.identifier(name), t.identifier(name), false, true)
        );
        const captureLocalsStmt = t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.identifier("Tracer"), t.identifier("captureLocals")),
            [t.objectExpression(paramsObjectProps)]
          )
        );
        captureLocalsStmt[ALREADY] = true;

        // Ensure body is a BlockStatement
        if (!t.isBlockStatement(path.node.body)) {
          path.node.body = t.blockStatement([t.returnStatement(path.node.body)]);
        }
        // Insert at top of function
        path.get("body").unshiftContainer("body", captureLocalsStmt);


        // --- 2) Robust Free-Variable Analysis for Closure ---
        const funcScope = path.scope;                   // the function’s own scope
        const boundNames = new Set(Object.keys(funcScope.bindings));
        // Also include the function’s own name (for FunctionDeclaration)
        if (path.node.id && t.isIdentifier(path.node.id)) {
          boundNames.add(path.node.id.name);
        }

        const freeNames = new Set();
        path.traverse({
          Identifier(idPath) {
            // Only real references, not declarations, keys, tracer calls, etc.
            if (!idPath.isReferencedIdentifier()) return;
            const name = idPath.node.name;
            if (SKIP_NAMES.has(name)) return;

            // Avoid instrumentation of our own captureLocals or captureClosure AST
            if (idPath.node[ALREADY]) return;

            // Find the binding (if any)
            const binding = idPath.scope.getBinding(name);
            if (!binding) {
              // No binding => likely a global; skip or include as you choose
              return;
            }
            // If the binding’s defining scope is NOT the current function’s scope,
            // then this is a free (outer) variable that we should capture.
            if (binding.scope !== funcScope) {
              freeNames.add(name);
            }
          },
          // Don’t descend into nested functions
          Function(inner) { inner.skip(); }
        });

        // Build closure‐capture only if we found any true frees
        const closureProps = Array.from(freeNames)
          .map(name =>
            t.objectProperty(t.identifier(name), t.identifier(name), false, true)
          );
        if (closureProps.length > 0) {
          // Generate an ID for this function’s closure
          const fnIdCall = t.callExpression(t.identifier("nextId"), []);
          const captureClosureStmt = t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.identifier("Tracer"), t.identifier("captureClosure")),
              [fnIdCall, t.objectExpression(closureProps)]
            )
          );
          captureClosureStmt[ALREADY] = true;

          // Insert *after* the function declaration
          const stmtParent = path.getStatementParent();
          if (stmtParent) {
            stmtParent.insertAfter(captureClosureStmt);
          }
        }
      }
    }
  };
};