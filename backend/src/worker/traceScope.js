module.exports = function traceScope({ types: t }) {
  const ALREADY = Symbol("scopeInstrumented");

  return {
    visitor: {
      Function(path) {
        // only once per function
        if (path.node[ALREADY]) return;
        path.node[ALREADY] = true;

        // 1) Capture parameters & locals
        const params = path.node.params
          .filter(p => t.isIdentifier(p))
          .map(p => p.name);

        const locals = new Set(params);
        path.traverse({
          VariableDeclarator(vp) {
            if (t.isIdentifier(vp.node.id)) {
              locals.add(vp.node.id.name);
            }
          },
          Function(inner) {
            inner.skip();
          }
        });
        const localsProps = Array.from(locals).map(name =>
          t.objectProperty(t.identifier(name), t.identifier(name), false, true)
        );
        const captureLocals = t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.identifier("Tracer"), t.identifier("captureLocals")),
            [ t.objectExpression(localsProps) ]
          )
        );
        captureLocals[ALREADY] = true;
        // Ensure body exists and is a block before unshifting
        if (!path.node.body) return; // Handle cases like abstract methods or declarations
        if (!t.isBlockStatement(path.node.body)) {
            // Convert expression body to block statement if necessary
            path.node.body = t.blockStatement([t.returnStatement(path.node.body)]);
        }
        path.get("body").unshiftContainer("body", captureLocals);


        // 2) Capture closure (free vars)
        const bound = new Set([...locals, path.node.id?.name].filter(Boolean));
        const free = new Set();
        path.traverse({
          Identifier(idPath) {
            // Check if the identifier is a binding identifier (declaration)
            if (idPath.isBindingIdentifier()) return;

            // Check if it's a property of a member expression
            if (idPath.parentPath.isMemberExpression() && idPath.key === 'property' && !idPath.parentPath.node.computed) return;

            // Check if it's a key in an object property
            if (idPath.parentPath.isObjectProperty() && idPath.key === 'key' && !idPath.parentPath.node.computed) return;

            // Check if it's part of a label
            if (idPath.parentPath.isLabeledStatement() && idPath.key === 'label') return;
            if (idPath.parentPath.isBreakStatement() && idPath.key === 'label') return;
            if (idPath.parentPath.isContinueStatement() && idPath.key === 'label') return;

            // Check if it's already marked or bound locally
            if (
              bound.has(idPath.node.name) ||
              idPath.node[ALREADY]
            ) {
              return;
            }

            // Check if it's a referenced identifier (not a declaration/binding)
            if (idPath.isReferencedIdentifier()) {
                 // Additional check: ensure it's not the 'Tracer' identifier itself or its methods
                 if (idPath.node.name === 'Tracer') return;
                 if (idPath.parentPath.isMemberExpression() && idPath.parentPath.get('object').isIdentifier({ name: 'Tracer' })) return;

                 // Check scope to ensure it's not shadowed by an inner scope's binding
                 const binding = idPath.scope.getBinding(idPath.node.name);
                 // If there's a binding, and it's NOT defined in the current function's scope or outer scopes
                 // (meaning it's defined in an inner scope), then it's not free in *this* function's context.
                 // However, the simple check `bound.has` should cover most cases.
                 // A more robust check might involve comparing `binding.path.scope` with `path.scope`.
                 // For now, let's rely on the `bound` check and `isReferencedIdentifier`.

                 free.add(idPath.node.name);
            }
          },
          Function(inner) { inner.skip(); } // Skip inner functions to avoid capturing their free vars
        });


        // filter out internal names
        const SKIP = new Set(["Tracer", "nextId", "console", "_", "lodash", "fetch"]);
        const closureProps = Array.from(free)
          .filter(n => !SKIP.has(n))
          .map(name =>
            t.objectProperty(t.identifier(name), t.identifier(name), false, true)
          );
        if (closureProps.length) {
          const captureClosure = t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.identifier("Tracer"), t.identifier("captureClosure")),
              [ t.callExpression(t.identifier("nextId"), []), t.objectExpression(closureProps) ]
            )
          );
          captureClosure[ALREADY] = true;
          // insert right after the function statement
          const stmt = path.getStatementParent();
          // Ensure stmt exists before inserting; handle expression contexts if necessary
          if (stmt) {
            stmt.insertAfter(captureClosure);
          } else {
            // Fallback or error for functions not directly within a statement context
            // This might happen for function expressions used directly in calls, etc.
            // Consider if path.insertAfter() is appropriate or if an error should be logged.
            console.warn("[traceScope] Could not find statement parent for closure capture.");
            // path.insertAfter(captureClosure); // Potential fallback, might place incorrectly
          }
        }
      }
    }
  };
};
