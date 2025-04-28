module.exports = function traceVariables({ types: t }) {
  const SKIP = new Set(["Tracer", "nextId", "console", "_", "lodash", "fetch"]);
  const ALREADY = Symbol("varAccessInstrumented");

  return {
    visitor: {
      // Wrap the RHS of x = expr as x = Tracer.varWrite("x", expr)
      AssignmentExpression(path) {
        // Prevent infinite recursion if the RHS is already a Tracer call
        if (path.get("right").isCallExpression() &&
            path.get("right.callee").isMemberExpression() &&
            path.get("right.callee.object").isIdentifier({ name: "Tracer" })) {
          return;
        }
        

        const left = path.node.left;
        if (!t.isIdentifier(left)) return;
        const name = left.name;
        if (SKIP.has(name)) return;

        // Check if already instrumented by this specific logic
        if (path.node[ALREADY]) return;
        path.node[ALREADY] = true; // Mark the assignment expression itself

        // Get scopeId from path.scope.data (set by traceScope.js)
        let scopeId = "global";
        if (path.scope && path.scope.data && path.scope.data.scopeId) {
          scopeId = path.scope.data.scopeId;
        }

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

        const newRight = t.callExpression(
          t.memberExpression(t.identifier("Tracer"), t.identifier("varWrite")),
          [
            t.stringLiteral(scopeId),
            t.stringLiteral(name),
            path.node.right,
            t.stringLiteral(valueType)
          ]
        );
        // Mark the new node to prevent re-instrumentation if traversal restarts
        newRight[ALREADY] = true;
        path.get("right").replaceWith(newRight);
        // path.skip(); // Maybe skip to prevent re-visiting the new node immediately? Test this.
      },

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
  };
};
