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
        if (path.node[SCOPE_INSTRUMENTED]) {
             console.log(`[traceScope] Node already instrumented, skipping.`);
             return;
        }
        path.node[SCOPE_INSTRUMENTED] = true;

        // --- Generate unique scopeId for this function's LEXICAL scope ---
        let functionLexicalId = path.node._funcScopeId;
        if (!functionLexicalId) {
            functionLexicalId = generateUniqueId('funcScopeId-');
            path.node._funcScopeId = functionLexicalId;
            console.log(`[traceScope] Assigned _funcScopeId '${functionLexicalId}' to function ${path.node.id?.name || '(anon)'}`);
        } else {
            console.log(`[traceScope] Using existing _funcScopeId '${functionLexicalId}' for function ${path.node.id?.name || '(anon)'}`);
        }
        path.scope.data = path.scope.data || {};
        path.scope.data.scopeId = functionLexicalId;

        // --- Determine parent's LEXICAL Id ---
        let parentLexicalId = "global";
        let parentScopePath = path.scope.getFunctionParent()?.path || path.scope.getProgramParent()?.path;

        if (parentScopePath?.isFunction() && parentScopePath.node?._funcScopeId) {
            parentLexicalId = parentScopePath.node._funcScopeId;
        } else if (parentScopePath?.isProgram()) {
            parentLexicalId = "global";
        } else {
            console.warn(`[traceScope] Could not determine valid lexical parent scope ID for function ${functionLexicalId}. Falling back to 'global'. Parent path type: ${parentScopePath?.type}`);
            parentLexicalId = "global";
        }
        console.log(`[traceScope] Determined parent lexical ID: ${parentLexicalId} for function ${functionLexicalId}`);

        // --- 1) Capture parameters & locals at function entry ---
        const params = path.node.params
          .filter(p => t.isIdentifier(p))
          .map(p => p.name);

        const initialLocalsProps = params.map(name =>
          t.objectProperty(t.identifier(name), t.identifier(name), false, true)
        );

        const captureLocalsStmt = t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.identifier("Tracer"), t.identifier("captureLocals")),
            [
              t.stringLiteral(functionLexicalId),
              t.stringLiteral(parentLexicalId),
              t.objectExpression(initialLocalsProps)
            ]
          )
        );
        captureLocalsStmt[SCOPE_INSTRUMENTED] = true;

        if (!t.isBlockStatement(path.node.body)) {
          path.node.body = t.blockStatement([t.returnStatement(path.node.body)]);
        }
        path.get("body").unshiftContainer("body", captureLocalsStmt);
        console.log(`[traceScope] Inserted captureLocals for function ${functionLexicalId}.`);

        // --- 2) Free-Variable Analysis for Closure Capture ---
        const funcScope = path.scope;
        const freeNames = new Set();
        path.traverse({
          Identifier(idPath) {
            if (!idPath.isReferencedIdentifier()) return;
            if (idPath.findParent(p => p.node && p.node[SCOPE_INSTRUMENTED])) return;
            const name = idPath.node.name;
            if (SKIP_NAMES.has(name)) return;
            if (idPath.parentPath.isCatchClause() && idPath.key === 'param') return;
            const binding = idPath.scope.getBinding(name);
            if (!binding) return;
            if (binding.scope.path.isCatchClause()) return;
            if (binding.scope !== funcScope) {
              if (funcScope.hasBinding(name, true)) {
                freeNames.add(name);
              }
            }
          },
          Function(inner) { inner.skip(); }
        });

        console.log(`[traceScope Closure] Found free variables: ${freeNames.size > 0 ? [...freeNames].join(', ') : 'None'} for function ${functionLexicalId}`);

        if (freeNames.size > 0) {
            const closureProps = Array.from(freeNames).map(name =>
                t.objectProperty(t.identifier(name), t.identifier(name), false, true)
            );

            const captureClosureStmt = t.expressionStatement(
                t.callExpression(
                    t.memberExpression(t.identifier("Tracer"), t.identifier("captureClosure")),
                    [
                        t.stringLiteral(functionLexicalId),
                        t.stringLiteral(parentLexicalId),
                        t.objectExpression(closureProps)
                    ]
                )
            );
            captureClosureStmt[SCOPE_INSTRUMENTED] = true;

            const stmtParent = path.getStatementParent();
            if (stmtParent && !stmtParent.getData('closureCaptureInstrumented')) {
                try {
                    stmtParent.insertAfter(captureClosureStmt);
                    stmtParent.setData('closureCaptureInstrumented', true);
                    console.log(`[traceScope Closure] Inserted captureClosure statement after parent statement for function ${functionLexicalId}.`);
                } catch (e) {
                    console.error(`[traceScope Closure] Error inserting captureClosure statement for ${functionLexicalId}:`, e);
                }
            } else if (!stmtParent) {
                console.warn(`[traceScope Closure] Could not find statement parent for function ${functionLexicalId}. Capture statement not inserted.`);
            } else {
                console.log(`[traceScope Closure] Parent statement already instrumented for closure capture. Skipping insert for ${functionLexicalId}.`);
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
