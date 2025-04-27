// src/worker/traceScopeAndClosures.js
module.exports = function traceScopeAndClosures({ types: t }) {
  // unique marker so we never collide with real AST props
  const ALREADY = Symbol("scopeClosureInstrumented");
  // Shared set of names to skip for VarRead/VarWrite
  const SKIP_NAMES = new Set(['Tracer', 'nextId', 'console', '_', 'lodash', 'fetch']);

  return {
    visitor: {
      Function(path) {
        // 1) Bail out if this Function has already been instrumented
        if (path.node[ALREADY]) return;

        // Tag this node so we don't re-enter this visitor on re-traverse
        path.node[ALREADY] = true;

        // Generate a stable ID for this function (for closure tracking)
        const fnId = t.callExpression(t.identifier("nextId"), []);
        
        // Collect parameter names
        const params = path.node.params
          .filter(p => t.isIdentifier(p))
          .map(p => p.name);

        // Collect local var/let/const names
        const localVars = [];
        path.traverse({
          VariableDeclarator(varPath) {
            const id = varPath.node.id;
            if (t.isIdentifier(id)) localVars.push(id.name);
          },
          // avoid re-visiting nested functions
          Function(inner) { inner.skip(); }
        });

        // Build the captureLocals(...) call
        const uniqueNames = Array.from(new Set([...params, ...localVars]));
        const localsProps = uniqueNames.map(name =>
          t.objectProperty(t.identifier(name), t.identifier(name), false, true)
        );
        const captureLocals = t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.identifier("Tracer"), t.identifier("captureLocals")),
            [ t.objectExpression(localsProps) ]
          )
        );
        // mark it so our AssignmentExpression visitor won't touch it
        captureLocals[ALREADY] = true;

        // Insert it at the top of the function body
        if (t.isBlockStatement(path.node.body)) {
          path.get("body").unshiftContainer("body", captureLocals);
        } else {
          // arrow-expression shorthand (no block) – wrap in block
          const expr = path.node.body;
          path.node.body = t.blockStatement([
            captureLocals,
            t.returnStatement(expr)
          ]);
        }

        // Now capture the closure: find free vars
        const bound = new Set(uniqueNames.concat(path.node.id ? [path.node.id.name] : []));
        const free = new Set();
        // Define internal names here to use in the filter below
        const internalNames = new Set(['Tracer', 'nextId', 'console', '_', 'lodash', 'fetch']);

        path.traverse({
          Identifier(idPath) {
            const name = idPath.node.name;
            // skip if local or property key or our own Tracer calls
            if (bound.has(name)
             || idPath.parent.type === "MemberExpression" && idPath.parent.property === idPath.node
             || idPath.node[ALREADY]
            ) return;

            if (idPath.isReferencedIdentifier()) free.add(name);
          },
          // again, skip nested functions entirely
          Function(inner) { inner.skip(); }
        });

        // Filter out internal names from the free variables before creating properties
        const userFreeVars = Array.from(free).filter(name => !internalNames.has(name));

        const closureProps = userFreeVars.map(name => // Use filtered list
          t.objectProperty(t.identifier(name), t.identifier(name), false, true)
        );

        if (closureProps.length > 0) {
          const captureClosure = t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.identifier("Tracer"), t.identifier("captureClosure")),
              // Pass the fnId (defined earlier in the visitor)
              [ fnId, t.objectExpression(closureProps) ]
            )
          );
          captureClosure[ALREADY] = true; // Use the correct ALREADY symbol
          // insert the closure‐capture *after* the function declaration/expression
          // Be careful with insertion point relative to other plugins
          const statementParent = path.getStatementParent();
          if (statementParent) {
             statementParent.insertAfter(captureClosure);
          } else {
             // Fallback for expressions? May need adjustment. Consider if this case is valid.
             console.warn("traceScopeAndClosures: Could not find statement parent for closure capture insertion.", path.node);
             path.insertAfter(captureClosure); // Attempt fallback insertion
          }
        }

        // Finally, skip into children so we don't re‐instrument what we just did
        path.skip();
      },

      AssignmentExpression(path) {
        // guard against double‐instrumentation
        if (path.node[ALREADY]) return;

        // only handle simple `x = ...`
        const left = path.node.left;
        if (t.isIdentifier(left)) {
          const name = left.name;

          // *** FILTER CHECK for VarWrite ***
          if (SKIP_NAMES.has(name)) {
            return; // Don't instrument writes to internal/global objects
          }
          // *** END FILTER CHECK ***

          const writeCall = t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.identifier("Tracer"), t.identifier("varWrite")),
              [ t.stringLiteral(name), path.node.right ]
            )
          );
          writeCall[ALREADY] = true;
          path.insertAfter(writeCall);
          path.skip();
        }
      },

      // if you do VarRead, do something similar on Identifier visitor
      Identifier(path) {
        // Use the shared SKIP_NAMES set defined above

        if (path.node[ALREADY]) return;
        // e.g. skip if you're in left side of an assignment
        if (path.parent.type === "AssignmentExpression"
         && path.parent.left === path.node
        ) return;
        // only instrument reads in expression contexts
        if (path.isReferencedIdentifier()) {
          const name = path.node.name;

          // Skip instrumentation for reads of specified names using the shared set
          if (SKIP_NAMES.has(name)) {
            return;
          }

          const readCall = t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.identifier("Tracer"), t.identifier("varRead")),
              [ t.stringLiteral(name), path.node ]
            )
          );
          readCall[ALREADY] = true;
          // Insert before the statement containing the read for better logical flow
          const statementPath = path.getStatementParent();
          if (statementPath && !statementPath.node[ALREADY]) {
            statementPath.insertBefore(readCall);
            statementPath.node[ALREADY] = true;
          } else {
            // Fallback: insert after the identifier if statement parent is not found
            path.insertAfter(readCall);
          }
          path.skip();
        }
      }
    }
  };
};
