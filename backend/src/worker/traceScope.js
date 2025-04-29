// backend/src/worker/traceScope.js
// Define constants and helpers outside the main plugin function
const SCOPE_INSTRUMENTED = Symbol("scopeInstrumented"); // Renamed from ALREADY and moved
const SKIP_NAMES = new Set([
    "Tracer", "nextId", "console",
    "arguments", "this",       // skip built-ins
    "_", "lodash", "fetch"
  ]);

// Helper function to generate unique IDs
function generateUniqueId(prefix = 'id-') {
    // Assuming nextId is globally available or passed in somehow.
    // Fallback to random number if nextId isn't available.
    const uniquePart = typeof nextId === 'function' ? nextId() : Math.floor(Math.random() * 1000000);
    return `${prefix}${uniquePart}`;
}


const traceScopePlugin = function traceScope({ types: t }) {
  return {
    visitor: {
      Function(path) {
        // --- guard: only instrument once ---
console.log(`[traceScope] Entering Function visitor for node type: ${path.node.type}, Name: ${path.node.id?.name || '(anon)'}, Parent type: ${path.parent.type}`);
        if (path.node[SCOPE_INSTRUMENTED]) return; // Use exported constant
        path.node[SCOPE_INSTRUMENTED] = true;     // Use exported constant

        // --- Generate unique scopeId for this function ---
        const scopeId = generateUniqueId('funcScopeId-'); // Use helper function
        path.scope.data = path.scope.data || {};
        path.scope.data.scopeId = scopeId; // Attach ID to the scope data
console.log('[traceScope Scope Data Set]:', 'UID:', path.scope.uid, 'ScopeID:', scopeId, 'NodeID:', path.node._funcScopeId);

        // --- Determine parentId (enclosing function or global) ---
        let parentId = null;
        if (path.scope.parent && path.scope.parent.data && path.scope.parent.data.scopeId) {
          parentId = path.scope.parent.data.scopeId;
        } else {
          parentId = "global";
        }

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
            [
              t.stringLiteral(scopeId),
              t.stringLiteral(parentId),
              t.objectExpression(paramsObjectProps)
            ]
          )
        );
        captureLocalsStmt[SCOPE_INSTRUMENTED] = true; // Use exported constant

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

            // Skip catch clause parameters (e.g., _err, _err2)
            if (idPath.parentPath.isCatchClause() && idPath.key === 'param') {
                // Optional: console.log(`[traceScope FreeVar Check] Skipping catch clause param: ${idPath.node.name}`);
                return;
            }
            const name = idPath.node.name;
            if (SKIP_NAMES.has(name)) return;

            // Avoid instrumentation of our own captureLocals or captureClosure AST
            if (idPath.node[SCOPE_INSTRUMENTED]) return; // Use exported constant

            // Find the binding (if any)
            const binding = idPath.scope.getBinding(name);
            if (!binding) {
              // No binding => likely a global; skip or include as you choose
              return;
            }
            // If the binding’s defining scope is NOT the current function’s scope,
            // then this is a free (outer) variable that we should capture.
            // *** NEW CHECK ***
            // Check if the binding scope's defining node is a CatchClause
            if (binding.scope.path.isCatchClause()) {
                // Optional: console.log(`[traceScope FreeVar Check] Skipping '${idPath.node.name}' because it is bound in a CatchClause.`);
                return; // Don't treat catch parameters like _err as free variables
            }
            // *** END NEW CHECK ***
            if (binding.scope !== funcScope) {
              freeNames.add(name);
            }
          },
          // Don’t descend into nested functions
          Function(inner) { inner.skip(); }
        });
        console.log('[traceScope Function Visitor] Identified freeNames:', freeNames);

        // Build closure‐capture only if we found any true frees
        const closureProps = Array.from(freeNames)
          .map(name =>
            t.objectProperty(t.identifier(name), t.identifier(name), false, true)
          );
       console.log('[traceScope Function Visitor] Generated closureProps:', closureProps);
        if (closureProps.length > 0) {
          console.log('[traceScope Function Visitor] Condition (closureProps.length > 0) met:', closureProps.length > 0);
          // Generate an ID for this function’s closure
          const closureId = generateUniqueId('closure-'); // Use helper function
          const captureClosureStmt = t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.identifier("Tracer"), t.identifier("captureClosure")),
              [
                t.stringLiteral(closureId),
                t.stringLiteral(parentId),
                t.objectExpression(closureProps)
              ]
            )
          );
          console.log('[traceScope Function Visitor] Created captureClosureStmt AST node:', captureClosureStmt);
          captureClosureStmt[SCOPE_INSTRUMENTED] = true; // Use exported constant

          // Insert *after* the function declaration
          const stmtParent = path.getStatementParent();
          if (stmtParent) {
            stmtParent.insertAfter(captureClosureStmt);
            console.log('[traceScope Function Visitor] Executed stmtParent.insertAfter(captureClosureStmt)');
          }
        }
      }
    }
  };
};

// Export the plugin function and the helpers/constants
module.exports = {
    traceScopePlugin,
    generateUniqueId,
    SCOPE_INSTRUMENTED
};
