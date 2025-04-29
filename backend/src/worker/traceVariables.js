/**
 * Returns true if the variable name is an internal tracer variable.
 * Internal tracer variables start with _traceId or _callId.
 */
function isInternalTracerVar(name) {
  return typeof name === "string" && (name.startsWith("_traceId") || name.startsWith("_callId"));
}

const traceVariablesVisitor = (t, ALREADY, SKIP) => ({
    // Wrap the RHS of x = expr as x = Tracer.varWrite("x", expr)
    AssignmentExpression(path) {
        const left = path.node.left;
        if (!t.isIdentifier(left)) return;
        const name = left.name;
        if (isInternalTracerVar(name)) {
          return;
        }
        if (SKIP.has(name)) {
          return;
        }
        // Prevent infinite recursion if the RHS is already a Tracer call
        if (path.get("right").isCallExpression() &&
            path.get("right.callee").isMemberExpression() &&
            path.get("right.callee.object").isIdentifier({ name: "Tracer" })) {
          return;
        }
        if (path.node[ALREADY]) {
          return;
        }
        path.node[ALREADY] = true; // Mark the assignment expression itself

        // --- Accurate Scope Lookup Logic ---
        let scopeId = "global"; // Default

        // Prefer innermost function's _funcScopeId if present (closure-aware)
        let funcPath = path.getFunctionParent();
        if (funcPath && funcPath.node && Object.prototype.hasOwnProperty.call(funcPath.node, '_funcScopeId')) {
            scopeId = funcPath.node._funcScopeId;
        } else {
            // Fallback to binding's declaration scope as before
            const binding = path.scope.getBinding(name); // Find where 'name' is declared
            if (binding) {
                let funcScope = binding.scope;
                // Traverse up to find the nearest function or program scope
                while (funcScope && !funcScope.path.isFunction() && !funcScope.path.isProgram()) {
                    funcScope = funcScope.parent;
                }

                if (funcScope && funcScope.path.isFunction()) {
                    if (funcScope.path.node && Object.prototype.hasOwnProperty.call(funcScope.path.node, '_funcScopeId')) {
                        scopeId = funcScope.path.node._funcScopeId;
                    } else {
                        scopeId = "unknown-missing-funcScopeId";
                    }
                } else if (funcScope && funcScope.path.isProgram()) {
                    scopeId = "global";
                } else {
                    scopeId = "unknown-no-scope";
                }
            } else {
                scopeId = "global";
            }
        }
        // --- End of Accurate Scope Lookup Logic ---

        // Determine valueType from path.node.right
        let valueType = "unknown";
        if (path.node.right) {
          if (t.isNumericLiteral(path.node.right)) valueType = "number";
          else if (t.isStringLiteral(path.node.right)) valueType = "string";
          else if (t.isBooleanLiteral(path.node.right)) valueType = "boolean";
          else if (t.isFunctionExpression(path.node.right) || t.isArrowFunctionExpression(path.node.right)) valueType = "function";
          else if (t.isObjectExpression(path.node.right)) valueType = "object";
          else if (t.isArrayExpression(path.node.right)) valueType = "array";
          else if (t.isNullLiteral(path.node.right)) valueType = "null";
          else if (t.isIdentifier(path.node.right) && path.node.right.name === "undefined") valueType = "undefined";
          else valueType = path.node.right.type || "unknown";
        }

        // Get line number
        const line = path.node.loc ? path.node.loc.start.line : -1; // Add line number

        const newRight = t.callExpression(
          t.memberExpression(t.identifier("Tracer"), t.identifier("varWrite")),
          [
            t.stringLiteral(scopeId),
            t.stringLiteral(name),
            path.node.right,
            t.stringLiteral(valueType),
            t.numericLiteral(line) // Add line number argument
          ]
        );
        newRight[ALREADY] = true;
        path.get("right").replaceWith(newRight);
      },

      UpdateExpression(path) {
        if (!t.isIdentifier(path.node.argument)) {
          return;
        }
        const name = path.node.argument.name;
        if (isInternalTracerVar(name)) {
          return;
        }
        if (SKIP.has(name)) {
          return;
        }
        if (path.node[ALREADY]) {
          return;
        }
        // --- Scope Lookup Logic (closure-aware) ---
        let scopeId = "global"; // Default

        // Prefer innermost function's _funcScopeId if present (closure-aware)
        let funcPath = path.getFunctionParent();
        if (funcPath && funcPath.node && Object.prototype.hasOwnProperty.call(funcPath.node, '_funcScopeId')) {
            scopeId = funcPath.node._funcScopeId;
        } else {
            // Fallback to binding's declaration scope as before
            const binding = path.scope.getBinding(name); // Find where 'name' is declared
            if (binding) {
                let funcScope = binding.scope;
                // Traverse up to find the nearest function or program scope
                while (funcScope && !funcScope.path.isFunction() && !funcScope.path.isProgram()) {
                    funcScope = funcScope.parent;
                }

                // Check if the found scope's *node* has the _funcScopeId property
                if (funcScope && funcScope.path && funcScope.path.node && Object.prototype.hasOwnProperty.call(funcScope.path.node, '_funcScopeId')) {
                    scopeId = funcScope.path.node._funcScopeId;
                } else if (funcScope && funcScope.path.isProgram()) {
                    scopeId = "global";
                } else {
                    scopeId = "global";
                }
            } else {
                scopeId = "global";
            }
        }
        // --- End of Scope Lookup Logic ---

        // UpdateExpressions operate on numbers
        const valueType = "number";

        // Get line number
        const line = path.node.loc ? path.node.loc.start.line : -1;

        // Create the Tracer.varWrite call expression to be inserted *after*
        // Pass the identifier itself, which will evaluate to the *updated* value after the expression runs
        const callExpr = t.callExpression(
          t.memberExpression(t.identifier("Tracer"), t.identifier("varWrite")),
          [
            t.stringLiteral(scopeId),
            t.stringLiteral(name),
            t.identifier(name), // Pass the variable's identifier node (evaluates to value *after* update)
            t.stringLiteral(valueType),
            t.numericLiteral(line) // Add line number argument
          ]
        );
        // Wrap it in an ExpressionStatement
        const callStatement = t.expressionStatement(callExpr);
        callStatement[ALREADY] = true; // Mark the generated statement

        // Get the parent statement (e.g., the ExpressionStatement containing the UpdateExpression)
        const statementParent = path.getStatementParent();
        if (statementParent) {
          try {
             statementParent.insertAfter(callStatement);
             // Mark original UpdateExpression node ONLY after successful insertion
             path.node[ALREADY] = true;
          } catch (e) {
             // error
          }
        }
      }, // End UpdateExpression

      // Visitor for initializations like: let x = 5; const y = 'abc'; var z = true;
      VariableDeclarator(path) {
        const idNode = path.node.id;
        const initNode = path.node.init;

        // Only instrument if there's an identifier and an initializer
        if (!t.isIdentifier(idNode) || !initNode) {
             return;
        }
        if (isInternalTracerVar(idNode.name)) {
             return;
        }
        if (t.isCallExpression(initNode) &&
            t.isMemberExpression(initNode.callee) &&
            t.isIdentifier(initNode.callee.object, { name: "Tracer" })) {
             return;
        }

        const name = idNode.name;
        if (SKIP.has(name)) {
          return;
        }
        if (path.node[ALREADY]) {
          return;
        }
        // --- Accurate Scope Lookup Logic ---
        let scopeId = "global"; // Default
        const binding = path.scope.getBinding(name); // Find where 'name' is declared

        if (binding) {
            let funcScope = binding.scope;
            // Traverse up to find the nearest function or program scope
            while (funcScope && !funcScope.path.isFunction() && !funcScope.path.isProgram()) {
                funcScope = funcScope.parent;
            }

            if (funcScope && funcScope.path.isFunction()) {
                if (funcScope.path.node && Object.prototype.hasOwnProperty.call(funcScope.path.node, '_funcScopeId')) {
                    scopeId = funcScope.path.node._funcScopeId;
                } else {
                    scopeId = "unknown-missing-funcScopeId";
                }
            } else if (funcScope && funcScope.path.isProgram()) {
                scopeId = "global";
            } else {
                scopeId = "unknown-no-scope";
            }
        } else {
            scopeId = "global";
        }
        // --- End of Accurate Scope Lookup Logic ---

        // Determine valueType from initNode
        let valueType = "unknown";
        if (t.isNumericLiteral(initNode)) valueType = "number";
        else if (t.isStringLiteral(initNode)) valueType = "string";
        else if (t.isBooleanLiteral(initNode)) valueType = "boolean";
        else if (t.isFunctionExpression(initNode) || t.isArrowFunctionExpression(initNode)) valueType = "function";
        else if (t.isObjectExpression(initNode)) valueType = "object";
        else if (t.isArrayExpression(initNode)) valueType = "array";
        else if (t.isNullLiteral(initNode)) valueType = "null";
        else if (t.isIdentifier(initNode) && initNode.name === "undefined") valueType = "undefined";
        else valueType = initNode.type || "unknown";

        // Get line number (from the VariableDeclarator node)
        const line = path.node.loc ? path.node.loc.start.line : -1;

        // Create the Tracer.varWrite call expression
        // IMPORTANT: Pass the *identifier* node as the value argument for insertAfter
        const callExpr = t.callExpression(
          t.memberExpression(t.identifier("Tracer"), t.identifier("varWrite")),
          [
            t.stringLiteral(scopeId),
            t.stringLiteral(name),
            t.identifier(name), // Pass the variable's identifier node
            t.stringLiteral(valueType),
            t.numericLiteral(line) // Add line number argument
          ]
        );
        // Wrap it in an ExpressionStatement
        const callStatement = t.expressionStatement(callExpr);
        callStatement[ALREADY] = true; // Mark the generated statement to prevent re-instrumentation

        // Get the parent statement (likely VariableDeclaration)
        const statementParent = path.getStatementParent();
        if (statementParent) {
          try {
             statementParent.insertAfter(callStatement);
             // Mark original declarator node ONLY after successful insertion
             path.node[ALREADY] = true;
          } catch (e) {
             // error
          }
        }
      }, // End VariableDeclarator

      // Replace any identifier read with Tracer.varRead("id", id)
      Identifier(path) {
        // guard against double‐wrapping or instrumenting generated code
        if (path.node[ALREADY]) return;

        // Skip if not referenced (e.g., declaration, function name)
        if (!path.isReferencedIdentifier()) return;

        // Skip if the identifier is the argument of an UpdateExpression (e.g., count++ or ++count)
        if (path.parentPath.isUpdateExpression() && path.key === 'argument') {
          return;
        }

        const name = path.node.name;
        if (SKIP.has(name)) return;

        // skip parameter binding sites & callee positions
        const binding = path.scope.getBinding(name);
        if (binding && binding.kind === "param") return;
        if (path.parentPath.isCallExpression() && path.key === "callee") return; // Use path.key

        // Skip if it's the property being accessed in a member expression (e.g., obj.PROP)
        if (path.parentPath.isMemberExpression() && path.key === 'property' && !path.parentPath.node.computed) return;

        // Skip if it's a key in an object property (unless computed)
        if (path.parentPath.isObjectProperty() && path.key === 'key' && !path.parentPath.node.computed) return;

        // Skip if it's inside a Tracer call already (either callee or argument)
        const parentCall = path.findParent(p => p.isCallExpression());
        if (parentCall && parentCall.get("callee").isMemberExpression() &&
            parentCall.get("callee.object").isIdentifier({ name: "Tracer" })) {
          return;
        }

        // Mark the original node before replacing
        path.node[ALREADY] = true;

        const wrapped = t.callExpression(
          t.memberExpression(t.identifier("Tracer"), t.identifier("varRead")),
          // Pass the original identifier node itself as the value argument
          [ t.stringLiteral(name), path.node /* t.identifier(name) */ ]
        );
        // Mark the new wrapper node
        wrapped[ALREADY] = true;
        path.replaceWith(wrapped);
        // path.skip(); // Skip further traversal on the replaced node
      }
    }
    
  );

const traceVariablesPlugin = function traceVariables({ types: t }) {
  const SKIP = new Set(["Tracer", "nextId", "console", "_", "lodash", "fetch"]);
  const ALREADY = Symbol("varAccessInstrumented"); // Keep symbol local to plugin instance if needed

  return {
    visitor: traceVariablesVisitor(t, ALREADY, SKIP) // Pass SKIP set to visitor
  };
};

module.exports = {
    traceVariablesPlugin,
    traceVariablesVisitor
};
