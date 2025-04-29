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
        
        console.log(`[traceVariables] AssignmentExpression: Entering for node`, path.node);
        const left = path.node.left;
        if (!t.isIdentifier(left)) return;
        const name = left.name;
        console.log(`[traceVariables] AssignmentExpression: Considering left.name = ${name}`);
        if (SKIP.has(name)) {
          console.log(`[traceVariables] AssignmentExpression: SKIP_NAMES check PASSED for ${name}`);
          return;
        } else {
          console.log(`[traceVariables] AssignmentExpression: SKIP_NAMES check FAILED for ${name}`);
        }

        // Check if already instrumented by this specific logic
        if (path.node[ALREADY]) {
          console.log(`[traceVariables] AssignmentExpression: ALREADY symbol check PASSED for ${name}`);
          return;
        } else {
          console.log(`[traceVariables] AssignmentExpression: ALREADY symbol check FAILED for ${name}`);
        }
        path.node[ALREADY] = true; // Mark the assignment expression itself

        // --- Replace current scopeId finding logic with this: ---
        let scopeId = "global"; // Default
        let currentScope = path.scope; // Start with the current node's scope
        while (currentScope) {
            // Check if the scope object itself has the data property with scopeId
            if (currentScope.data && currentScope.data.scopeId) {
                scopeId = currentScope.data.scopeId;
                console.log(`[traceVariables][${path.type}] Found scopeId '${scopeId}' for '${name}' at scope level: ${currentScope.path.type}`);
                break; // Found it!
            }
            // Check if the scope's *path* (the AST node defining the scope) has it
            // This is sometimes where plugins attach data
             else if (currentScope.path && currentScope.path.node && currentScope.path.node.data && currentScope.path.node.data.scopeId) {
                 scopeId = currentScope.path.node.data.scopeId;
                 console.log(`[traceVariables][${path.type}] Found scopeId '${scopeId}' for '${name}' on scope path node: ${currentScope.path.type}`);
                 break; // Found it!
            }
            // If it's the program scope, stop searching upwards
            if (currentScope.path && currentScope.path.isProgram()) {
                 console.log(`[traceVariables][${path.type}] Reached Program scope for '${name}', defaulting to global.`);
                 scopeId = "global"; // Ensure it's explicitly global if we hit the top
                 break;
            }
            currentScope = currentScope.parent; // Move up to the parent scope
        }
        if (!currentScope && scopeId === "global") {
            console.warn(`[traceVariables][${path.type}] Traversed scopes fully for '${name}', could not find specific scopeId, using 'global'.`);
        }
        // --- End of replacement logic ---

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
        console.log(`[traceVariables] AssignmentExpression: Created newRight (Tracer.varWrite call) for ${name}:`, newRight);
        // Mark the new node to prevent re-instrumentation if traversal restarts
        newRight[ALREADY] = true;
        console.log(`[traceVariables] AssignmentExpression: Attempting path.get("right").replaceWith(newRight) for ${name}`);
        path.get("right").replaceWith(newRight);
        console.log(`[traceVariables] AssignmentExpression: Successfully executed path.get("right").replaceWith(newRight) for ${name}`);
        // path.skip(); // Maybe skip to prevent re-visiting the new node immediately? Test this.
      },

      // Visitor for initializations like: let x = 5; const y = 'abc'; var z = true;
      VariableDeclarator(path) {
        const idNode = path.node.id;
        const initNode = path.node.init;

        // Only instrument if there's an identifier and an initializer
        if (!t.isIdentifier(idNode) || !initNode) {
             console.log(`[traceVariables][VariableDeclarator] Skipping declarator without id/init.`);
             return;
        }

        // Prevent infinite recursion if the init is already a Tracer call (less likely now, but good safety)
         if (t.isCallExpression(initNode) &&
             t.isMemberExpression(initNode.callee) &&
             t.isIdentifier(initNode.callee.object, { name: "Tracer" })) {
             console.log(`[traceVariables][VariableDeclarator] Skipping initializer already wrapped.`);
             return;
         }


        const name = idNode.name;
        console.log(`[traceVariables] VariableDeclarator: Considering id.name = ${name}`);

        if (SKIP.has(name)) {
          console.log(`[traceVariables] VariableDeclarator: SKIP_NAMES check PASSED for ${name}`);
          return;
        } else {
          console.log(`[traceVariables] VariableDeclarator: SKIP_NAMES check FAILED for ${name}`);
        }

        // Check if already instrumented (e.g., if plugin runs multiple times)
        // We check the *declarator node* itself now, as we insert after its parent statement
        if (path.node[ALREADY]) {
          console.log(`[traceVariables] VariableDeclarator: ALREADY symbol check PASSED for ${name}`);
          return;
        } else {
          console.log(`[traceVariables] VariableDeclarator: ALREADY symbol check FAILED for ${name}`);
        }
        // Mark it later, only if insertion succeeds

        // --- Replace current scopeId finding logic with this: ---
        let scopeId = "global"; // Default
        let currentScope = path.scope; // Start with the current node's scope
        while (currentScope) {
            // Check if the scope object itself has the data property with scopeId
            if (currentScope.data && currentScope.data.scopeId) {
                scopeId = currentScope.data.scopeId;
                console.log(`[traceVariables][${path.type}] Found scopeId '${scopeId}' for '${name}' at scope level: ${currentScope.path.type}`);
                break; // Found it!
            }
            // Check if the scope's *path* (the AST node defining the scope) has it
            // This is sometimes where plugins attach data
             else if (currentScope.path && currentScope.path.node && currentScope.path.node.data && currentScope.path.node.data.scopeId) {
                 scopeId = currentScope.path.node.data.scopeId;
                 console.log(`[traceVariables][${path.type}] Found scopeId '${scopeId}' for '${name}' on scope path node: ${currentScope.path.type}`);
                 break; // Found it!
            }
            // If it's the program scope, stop searching upwards
            if (currentScope.path && currentScope.path.isProgram()) {
                 console.log(`[traceVariables][${path.type}] Reached Program scope for '${name}', defaulting to global.`);
                 scopeId = "global"; // Ensure it's explicitly global if we hit the top
                 break;
            }
            currentScope = currentScope.parent; // Move up to the parent scope
        }
        if (!currentScope && scopeId === "global") {
            console.warn(`[traceVariables][${path.type}] Traversed scopes fully for '${name}', could not find specific scopeId, using 'global'.`);
        }
        // --- End of replacement logic ---


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

        // Create the Tracer.varWrite call expression
        // IMPORTANT: Pass the *identifier* node as the value argument for insertAfter
        const callExpr = t.callExpression(
          t.memberExpression(t.identifier("Tracer"), t.identifier("varWrite")),
          [
            t.stringLiteral(scopeId),
            t.stringLiteral(name),
            t.identifier(name), // Pass the variable's identifier node
            t.stringLiteral(valueType)
          ]
        );
        // Wrap it in an ExpressionStatement
        const callStatement = t.expressionStatement(callExpr);
        callStatement[ALREADY] = true; // Mark the generated statement to prevent re-instrumentation

        console.log(`[traceVariables] VariableDeclarator: Created VarWrite statement for ${name}`);

        // Get the parent statement (likely VariableDeclaration)
        const statementParent = path.getStatementParent();
        if (statementParent) {
          try {
             console.log(`[traceVariables] VariableDeclarator: Attempting insertAfter for ${name}`);
             statementParent.insertAfter(callStatement);
             console.log(`[traceVariables] VariableDeclarator: Successfully inserted VarWrite after declaration for ${name}`);
             // Mark original declarator node ONLY after successful insertion
             path.node[ALREADY] = true;
          } catch (e) {
             console.error(`[traceVariables][VariableDeclarator] Error inserting VarWrite for ${name}:`, e);
          }
        } else {
          console.error(`[traceVariables][VariableDeclarator] Could not find statement parent for ${name} to insert VarWrite after.`);
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
  };
};
