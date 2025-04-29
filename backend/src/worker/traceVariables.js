const traceVariablesVisitor = (t, ALREADY, SKIP) => ({
    // Wrap the RHS of x = expr as x = Tracer.varWrite("x", expr)
    AssignmentExpression(path) {
console.log(`[traceVariables Assign Entry]: name=${path.node.left.name}, loc=${JSON.stringify(path.node.loc)}`);
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

        // --- New Scope Lookup Logic ---
        let scopeId = "global"; // Default
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
                console.log(`[traceVariables][${path.type}] Found scopeId '${scopeId}' for '${name}' via binding lookup in funcScope.path.node._funcScopeId.`);
            } else if (funcScope && funcScope.path.isProgram()) {
                // If the binding is in the program scope, it's global
                scopeId = "global";
                console.log(`[traceVariables][${path.type}] Binding for '${name}' found in Program scope, using 'global'.`);
            } else {
                // Fallback if no function scope with _funcScopeId is found above the binding
                console.warn(`[traceVariables][${path.type}] Binding for '${name}' found, but couldn't find parent function scope with node._funcScopeId. Defaulting to 'global'.`);
                scopeId = "global";
            }
        } else {
            // No binding found, assume global (could be undeclared or built-in)
            scopeId = "global";
            console.log(`[traceVariables][${path.type}] No binding found for '${name}' in scope chain, assuming 'global'.`);
        }
        console.log(`[traceVariables Scope Lookup - Assign]: varName=${name}, bindingScopeId=${binding?.scope.uid}, finalScopeId=${scopeId}`);
        // --- End of New Scope Lookup Logic ---

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
        console.log(`[traceVariables] AssignmentExpression: Created newRight (Tracer.varWrite call) for ${name} at line ${line}:`, newRight);
        // Mark the new node to prevent re-instrumentation if traversal restarts
        newRight[ALREADY] = true;
        console.log(`[traceVariables] AssignmentExpression: Attempting path.get("right").replaceWith(newRight) for ${name}`);
        path.get("right").replaceWith(newRight);
        console.log(`[traceVariables] AssignmentExpression: Successfully executed path.get("right").replaceWith(newRight) for ${name}`);
        // path.skip(); // Maybe skip to prevent re-visiting the new node immediately? Test this.
      },

      UpdateExpression(path) {
        console.log(`[traceVariables Update - Enter]: name=${path.node.argument.name}`);
        // Ensure the argument is a simple identifier
        if (!t.isIdentifier(path.node.argument)) {
          console.log(`[traceVariables][UpdateExpression] Skipping non-identifier argument.`);
          return;
        }
        const name = path.node.argument.name;
        console.log(`[traceVariables] UpdateExpression: Considering argument.name = ${name}`);

        if (SKIP.has(name)) {
          console.log(`[traceVariables] UpdateExpression: SKIP_NAMES check PASSED for ${name}`);
          return;
        } else {
          console.log(`[traceVariables] UpdateExpression: SKIP_NAMES check FAILED for ${name}`);
        }

        // Check if already instrumented by this specific logic (on the UpdateExpression node itself)
        if (path.node[ALREADY]) {
          console.log(`[traceVariables] UpdateExpression: ALREADY symbol check PASSED for ${name}`);
          return;
        } else {
          console.log(`[traceVariables] UpdateExpression: ALREADY symbol check FAILED for ${name}`);
        }
        // Mark later, only if insertion succeeds

        // --- Scope Lookup Logic (Copied from AssignmentExpression/VariableDeclarator) ---
        let scopeId = "global"; // Default
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
                console.log(`[traceVariables][${path.type}] Found scopeId '${scopeId}' for '${name}' via binding lookup in funcScope.path.node._funcScopeId.`);
            } else if (funcScope && funcScope.path.isProgram()) {
                // If the binding is in the program scope, it's global
                scopeId = "global";
                console.log(`[traceVariables][${path.type}] Binding for '${name}' found in Program scope, using 'global'.`);
            } else {
                // Fallback if no function scope with _funcScopeId is found above the binding
                console.warn(`[traceVariables][${path.type}] Binding for '${name}' found, but couldn't find parent function scope with node._funcScopeId. Defaulting to 'global'.`);
                scopeId = "global";
            }
        } else {
            // No binding found, assume global (could be undeclared or built-in)
            scopeId = "global";
            console.log(`[traceVariables][${path.type}] No binding found for '${name}' in scope chain, assuming 'global'.`);
        }
        console.log(`[traceVariables Scope Lookup - Update]: varName=${name}, bindingScopeId=${binding?.scope.uid}, finalScopeId=${scopeId}`);
        console.log(`[traceVariables Update - Scope]: name=${name}, scopeId=${scopeId}`);
        // --- End of Scope Lookup Logic ---

        // UpdateExpressions operate on numbers
        const valueType = "number";

        // Create the Tracer.varWrite call expression to be inserted *after*
        // Pass the identifier itself, which will evaluate to the *updated* value after the expression runs
        const callExpr = t.callExpression(
          t.memberExpression(t.identifier("Tracer"), t.identifier("varWrite")),
          [
            t.stringLiteral(scopeId),
            t.stringLiteral(name),
            t.identifier(name), // Pass the variable's identifier node (evaluates to value *after* update)
            t.stringLiteral(valueType)
          ]
        );
        // Wrap it in an ExpressionStatement
        const callStatement = t.expressionStatement(callExpr);
        callStatement[ALREADY] = true; // Mark the generated statement

        console.log(`[traceVariables] UpdateExpression: Created VarWrite statement for ${name}`);

        // Get the parent statement (e.g., the ExpressionStatement containing the UpdateExpression)
        const statementParent = path.getStatementParent();
        if (statementParent) {
          try {
             console.log(`[traceVariables] UpdateExpression: Attempting insertAfter for ${name}`);
             // Insert the trace statement *after* the statement containing the update
             console.log(`[traceVariables Update - Instrument]: name=${name}, scopeId=${scopeId}`);
             statementParent.insertAfter(callStatement);
             console.log(`[traceVariables] UpdateExpression: Successfully inserted VarWrite after statement for ${name}`);
             // Mark original UpdateExpression node ONLY after successful insertion
             path.node[ALREADY] = true;
          } catch (e) {
             console.error(`[traceVariables][UpdateExpression] Error inserting VarWrite for ${name}:`, e);
          }
        } else {
          console.error(`[traceVariables][UpdateExpression] Could not find statement parent for ${name} to insert VarWrite after.`);
        }
      }, // End UpdateExpression

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

        // --- Skip internal trace IDs ---
        if (name.startsWith('_traceId')) {
          console.log(`[traceVariables] VariableDeclarator: Skipping internal trace variable ${name}`);
          return;
        }
        // --- End skip internal trace IDs ---

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

        // --- New Scope Lookup Logic ---
        let scopeId = "global"; // Default
        const binding = path.scope.getBinding(name); // Find where 'name' is declared

        if (binding) {
            let funcScope = binding.scope;
if (name === '_traceId') {
      console.log(`[traceVariables Scope Debug - _traceId funcScope]: name=${name}, funcScope=`, funcScope, `, typeof=${typeof funcScope}, funcScope?.type=${funcScope?.type}`);
    }
            // Traverse up to find the nearest function or program scope
            while (funcScope && !funcScope.path.isFunction() && !funcScope.path.isProgram()) {
                funcScope = funcScope.parent;
            }

            // Check if the found scope's *node* has the _funcScopeId property
console.log('[traceVariables Scope Data Check]:', 'Var:', name, 'ScopeUID:', funcScope?.uid, 'ScopeNodeID:', funcScope?.path?.node?._funcScopeId);
            if (funcScope && funcScope.path && funcScope.path.node && Object.prototype.hasOwnProperty.call(funcScope.path.node, '_funcScopeId')) {
                scopeId = funcScope.path.node._funcScopeId;
                console.log(`[traceVariables][${path.type}] Found scopeId '${scopeId}' for '${name}' via binding lookup in funcScope.path.node._funcScopeId.`);
            } else if (funcScope && funcScope.path.isProgram()) {
                // If the binding is in the program scope, it's global
                scopeId = "global";
                console.log(`[traceVariables][${path.type}] Binding for '${name}' found in Program scope, using 'global'.`);
            } else {
                // Fallback if no function scope with _funcScopeId is found above the binding
                console.warn(`[traceVariables][${path.type}] Binding for '${name}' found, but couldn't find parent function scope with node._funcScopeId. Defaulting to 'global'.`);
                scopeId = "global";
            }
        } else {
            // No binding found, assume global (could be undeclared or built-in)
            // Note: For VariableDeclarator, a binding should generally exist unless code is malformed.
            scopeId = "global";
            console.log(`[traceVariables][${path.type}] No binding found for '${name}' in scope chain, assuming 'global'.`);
        }
        // --- End of New Scope Lookup Logic ---

        // Log scope lookup details *after* the loop
// --- DETAILED SCOPE DEBUG LOGGING ---
console.log(`[traceVariables Scope Debug - Declare]: varName=${name}, Binding found: ${!!binding}`);
if (binding) {
    console.log(`[traceVariables Scope Debug - Declare]:   Binding Scope UID: ${binding.scope.uid}`);
    console.log(`[traceVariables Scope Debug - Declare]:   Binding Scope Type: ${binding.scope.type}`);
    console.log(`[traceVariables Scope Debug - Declare]:   Binding Scope Path Type: ${binding.scope.path.type}`);
    const hasFuncScopeId = binding.scope.hasOwnProperty('_funcScopeId');
    console.log(`[traceVariables Scope Debug - Declare]:   Binding Scope has _funcScopeId: ${hasFuncScopeId}${hasFuncScopeId ? ` (Value: ${binding.scope._funcScopeId})` : ''}`);

    // Re-run traversal logic for logging
    let logFuncScope = binding.scope;
    while (logFuncScope && !logFuncScope.path.isFunction() && !logFuncScope.path.isProgram()) {
        logFuncScope = logFuncScope.parent;
    }

    if (logFuncScope) {
        console.log(`[traceVariables Scope Debug - Declare]:   Found Parent Scope UID: ${logFuncScope.uid}`);
        console.log(`[traceVariables Scope Debug - Declare]:   Found Parent Scope Type: ${logFuncScope.type}`);
        console.log(`[traceVariables Scope Debug - Declare]:   Found Parent Scope Path Type: ${logFuncScope.path.type}`);
        // Check the node associated with the scope for _funcScopeId
        const parentHasScopeId = logFuncScope.path.isFunction() && logFuncScope.path.node && Object.prototype.hasOwnProperty.call(logFuncScope.path.node, '_funcScopeId');
        console.log(`[traceVariables Scope Debug - Declare]:   Found Parent Scope has node._funcScopeId: ${parentHasScopeId}${parentHasScopeId ? ` (Value: ${logFuncScope.path.node._funcScopeId})` : ''}`);
    } else {
        console.log(`[traceVariables Scope Debug - Declare]:   Could not find Function/Program parent scope during traversal.`);
    }
}
// --- END DETAILED SCOPE DEBUG LOGGING ---
        console.log(`[traceVariables Scope Lookup - Declare]: varName=${name}, bindingScopeId=${binding?.scope.uid}, finalScopeId=${scopeId}`);

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
