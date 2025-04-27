// src/worker/traceScopeAndClosures.js
module.exports = function traceScopeAndClosures({ types: t }) {
  // unique marker so we never collide with real AST props
  const ALREADY = Symbol("scopeClosureInstrumented");
  // EXPANDED SKIP_NAMES
  const SKIP_NAMES = new Set([ // Keep existing + add _traceId, _temp
      'Tracer', 'nextId', 'console',
      '_', 'lodash', 'fetch',
      '_traceId', '_temp', '_this', '_ref' // Added internal/temp vars
  ]);
  // Maybe a separate symbol for VarRead added?
  const VAR_READ_ADDED = Symbol("varReadAdded"); // Add symbol for VarRead

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
        // internalNames is now defined globally as SKIP_NAMES
        // Removed duplicate 'bound' and 'free' declarations

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
        const userFreeVars = Array.from(free).filter(name => !SKIP_NAMES.has(name)); // Ensure using SKIP_NAMES

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
        // path.skip(); // Keep removed
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
          // Remove path.skip(); from the END of this visitor block if present
          // path.skip(); // Keep removed
        }
      },

      Identifier(path) {
        // --- Prevent Recursion ---
        // 1. Skip if node is already marked by *this* plugin for read tracing
        if (path.node[VAR_READ_ADDED]) return;
        // 2. Skip if node is marked by *any* plugin as already processed/generated
        //    (Requires consistent use of a shared 'ALREADY' symbol across plugins)
        if (path.node[ALREADY]) return; // Check shared 'ALREADY' symbol

        // 3. Skip if inside a MemberExpression whose object is Tracer (e.g., Tracer.varRead)
        if (path.parentPath.isMemberExpression() &&
            path.parentPath.get('object').isIdentifier({name: 'Tracer'})) {
            // This identifier is 'varRead', 'enterFunc', etc.
            return;
        }
        // 4. Skip if inside a CallExpression whose callee's object is Tracer
        //    (This handles identifiers used *as arguments* to Tracer.* calls)
        if (path.parentPath.isCallExpression() &&
            path.parentPath.get('callee').isMemberExpression() &&
            path.parentPath.get('callee').get('object').isIdentifier({name: 'Tracer'})) {
            // We want to prevent infinite loops, but maybe we DO want to trace reads
            // of variables *passed* to Tracer, just not the Tracer object itself.
            // Let's keep this check simple for now: skip all args within Tracer.* calls
            return;
        }
        // --- End Recursion Prevention ---

        // Skip assignment left-hand side
        if (path.parent.type === "AssignmentExpression" && path.parent.left === path.node) return;

        // Only instrument referenced identifiers
        if (path.isReferencedIdentifier()) {
          const name = path.node.name;

          // 1) Skip reads of function parameters
          const binding = path.scope.getBinding(name);
          if (binding && binding.kind === 'param') return;

          // 2) Skip reads when this identifier *is* the callee of a call expression
          if (
            path.parentPath.isCallExpression() &&
            path.parentKey === 'callee'
          ) {
            return;
          }

          // Filter known internal/global names
          if (SKIP_NAMES.has(name)) return;

          // Filter arguments to console.*
          const parentConsoleCall = path.findParent((p) =>
             p.isCallExpression() &&
             p.get('callee').isMemberExpression() &&
             p.get('callee').get('object').isIdentifier({ name: 'console' })
          );
          if (parentConsoleCall) {
              console.log(`[traceScope] Skipping VarRead for arg to console call: ${name}`);
              return;
          }

          // Create the VarRead call AST node
          const readCall = t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.identifier("Tracer"), t.identifier("varRead")),
              [ t.stringLiteral(name), path.node ] // Pass original identifier node as value read
            )
          );
          // Mark the generated statement itself with the shared symbol if possible
          readCall[ALREADY] = true;

          // Attempt Insertion
          try {
            // Mark the *original identifier* node *before* inserting
            path.node[VAR_READ_ADDED] = true;
            // Insert the new statement *after* the original identifier's statement parent
            const statementParent = path.getStatementParent();
            if (statementParent) {
                 console.log(`[traceScope] Inserting VarRead for "${name}" after statement L${statementParent.node.loc?.start.line}`);
                 statementParent.insertAfter(readCall);
            } else {
                 console.warn(`[traceScope] No statement parent for VarRead of "${name}", inserting after path.`);
                 path.insertAfter(readCall); // Fallback
            }
          } catch(e) {
            console.error(`[traceScope] Error inserting VarRead after identifier ${name}`, e);
            // If insertion fails, maybe unmark the node?
            // delete path.node[VAR_READ_ADDED];
          }

          // Do NOT skip traversal
          // path.skip();
        }
      }
    }
  };
};
