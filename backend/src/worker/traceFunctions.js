// backend/src/worker/traceFunctions.js
const { generateUniqueId, SCOPE_INSTRUMENTED } = require('./traceScope'); // Import from traceScope
const { traceVariablesVisitor } = require('./traceVariables'); // Import the visitor object

module.exports = function traceFunctions({ types: t }) {
  const FUNCTION_TRACED = Symbol("functionTraced");
  const isTraceableFunction = (path) =>
    path.isFunctionDeclaration() ||
    path.isFunctionExpression() ||
    path.isArrowFunctionExpression();

  // Add a flag to see if the visitor ran at all
  let visitorRan = false;

  // Helper function to instrument CallExpressions
  function instrumentCallExpression(path) {
      // Add logging to see if this visitor runs
      console.log(`[traceFunctions] instrumentCallExpression called for node at L${path.node.loc?.start.line}`);

      // Only instrument direct function calls, not super, import, etc.
      if (!path.node.loc) {
         console.log(`[traceFunctions] instrumentCallExpression skipped: No location info.`);
         return;
      }
      // Avoid instrumenting calls to our own Tracer methods
      if (path.get("callee").isMemberExpression() && path.get("callee.object").isIdentifier({ name: "Tracer" })) {
          console.log(`[traceFunctions] instrumentCallExpression skipped: Tracer call.`);
          return;
      }
      // Avoid instrumenting calls to nextId
      if (path.get("callee").isIdentifier({ name: "nextId" })) {
           console.log(`[traceFunctions] instrumentCallExpression skipped: nextId call.`);
           return;
      }
      // Avoid instrumenting the call we are about to insert
      if (path.get("callee").isMemberExpression() && path.get("callee.property").isIdentifier({ name: "beforeCall" })) {
           console.log(`[traceFunctions] instrumentCallExpression skipped: Already instrumented (beforeCall).`);
           return;
      }


      const t = path.hub.file.opts.parserOpts.plugins.includes("typescript") ? path.hub.file.constructor.types : require("@babel/types");
      const callId = path.scope.generateUidIdentifier("callId");
      const callSiteLine = t.numericLiteral(path.node.loc.start.line);
      console.log(`[traceFunctions] instrumentCallExpression: Preparing to instrument call at line ${callSiteLine.value}`);

      // Insert: const _callId = nextId();
      const callIdDecl = t.variableDeclaration("const", [
        t.variableDeclarator(callId, t.callExpression(t.identifier("nextId"), []))
      ]);
      // Insert: Tracer.beforeCall(_callId, callSiteLine);
      const beforeCallStmt = t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.identifier("Tracer"), t.identifier("beforeCall")),
          [callId, callSiteLine]
        )
      );
      // Insert both before the call expression's statement
      const stmt = path.getStatementParent();
      if (stmt && !stmt.getData('beforeCallInstrumented')) { // Avoid double instrumentation if traversal runs twice
        console.log(`[traceFunctions] instrumentCallExpression: Found statement parent. Inserting BeforeCall instrumentation.`);
        stmt.insertBefore([callIdDecl, beforeCallStmt]);
        stmt.setData('beforeCallInstrumented', true); // Mark the statement parent
      } else if (!stmt) {
         console.warn(`[traceFunctions] instrumentCallExpression: Could not find statement parent for call at L${path.node.loc?.start.line}. BeforeCall instrumentation skipped.`);
      } else {
         console.log(`[traceFunctions] instrumentCallExpression: Statement parent already instrumented. Skipping insertion.`);
      }
  }

  return {
    visitor: {
      // Keep CallExpression visitor for calls OUTSIDE instrumented functions (e.g., global scope)
      CallExpression: instrumentCallExpression,

      Function(path) {
        visitorRan = true; // Mark that the visitor was entered
        console.log(`[traceFunctions] Entered Function visitor for node type: ${path.node.type}, Name: ${path.node.id?.name || '(anon)'}`); // Log entry

        // --- Ensure every function node gets a unique _funcScopeId ---
        if (!Object.prototype.hasOwnProperty.call(path.node, '_funcScopeId')) {
          // Use generateUniqueId from traceScope.js if available, else fallback
          if (typeof generateUniqueId === 'function') {
            path.node._funcScopeId = `funcScopeId-${generateUniqueId()}`;
          } else {
            // Fallback: use a random string if generateUniqueId is not available
            path.node._funcScopeId = `funcScopeId-${Math.random().toString(36).slice(2, 10)}`;
          }
        }
        // --- End _funcScopeId assignment ---

        if (!isTraceableFunction(path)) {
          console.log(`[traceFunctions] Skipping non-traceable function type: ${path.node.type}`);
          return;
        }

        let functionBodyPath = path.get("body");
        console.log(`[traceFunctions] Got body path. Is block? ${functionBodyPath.isBlockStatement()}`);

        // 1. Ensure we have a BlockStatement body (Copied from user feedback)
        if (!functionBodyPath.isBlockStatement()) {
          // Handle arrow function implicit return: Convert expression body to block
          if (functionBodyPath.node) {
             // Check if it's null/undefined before wrapping
             if (functionBodyPath.node.type) {
                const expressionBody = functionBodyPath.node;
                functionBodyPath.replaceWith(t.blockStatement([t.returnStatement(expressionBody)]));
                // We mutated the path, re-fetch the path to the new block statement
                functionBodyPath = path.get("body");
                console.log(`[traceFunctions] Converted expression body to block.`); // Log conversion
             } else {
                 console.warn("traceFunctions: Encountered function with null/undefined body, skipping.", path.node);
                 return; // Cannot instrument non-existent body
             }
          } else {
            console.warn("traceFunctions: Cannot find body path for function, skipping.", path.node);
            return; // Cannot instrument non-existent body
          }
        }


        if (!functionBodyPath || !functionBodyPath.node) {
             console.error("[traceFunctions] ERROR: Could not get valid body path after potential conversion.");
             return;
        }

        // 2. Guard: Check if already instrumented (Copied from user feedback)
        if (functionBodyPath.node[FUNCTION_TRACED]) {
          console.log(`[traceFunctions] Body already traced, skipping.`);
          return;
        }

        console.log(`[traceFunctions] Proceeding to instrument function: ${path.node.id?.name || '(anon)'}`);

        // 3. Prepare IDs and Tracer arguments (Copied from user feedback)
        const traceId = path.scope.generateUidIdentifier("traceId");
// Store traceId name in scope data for ReturnStatement visitor
        let fnName = 'anonymous';
        if (path.node.id) {
            fnName = path.node.id.name;
        } else if (path.parentPath.isVariableDeclarator() && path.parentPath.get('id').isIdentifier()) {
            fnName = path.parentPath.get('id').node.name;
        } else if (path.parentPath.isObjectProperty() && path.parentPath.get('key').isIdentifier()) {
           fnName = path.parentPath.get('key').node.name;
        } else if (path.parentPath.isClassMethod()) {
           fnName = path.parentPath.get('key').node.name;
        }
        const start = path.node.loc ? t.numericLiteral(path.node.loc.start.line) : t.nullLiteral();
        const end = path.node.loc ? t.numericLiteral(path.node.loc.end.line) : t.nullLiteral();
        const errorParam = path.scope.generateUidIdentifier("err");

        // Retrieve scopeId directly from the node property set by traceScope.js
        // Default to 'global' if not found (should ideally always be found for instrumented functions)
        const funcScopeId = path.node?._funcScopeId ? t.stringLiteral(path.node._funcScopeId) : t.stringLiteral("global");
        if (!path.node?._funcScopeId) {
             console.warn(`[traceFunctions EnterFunction] Could not find _funcScopeId on node for ${fnName}. Defaulting to 'global'. Node:`, path.node);
        } else {
             console.log(`[traceFunctions EnterFunction] Using scopeId '${path.node._funcScopeId}' from node._funcScopeId for ${fnName}`);
        }


        // Placeholders for thisBinding and callSiteLine (can be null for now)
        const thisBinding = t.nullLiteral();
        // Do not emit callSiteLine as null; let reducer use stack from BeforeCall
        // const callSiteLine = t.nullLiteral();
        // Remove callSiteLine from enterFunc if not available

        // 4. Create Tracer calls as AST nodes (Copied from user feedback & FIXED placeholders)
        const enterCall = t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.identifier("Tracer"), t.identifier("enterFunc")),
            [
              traceId,
              t.stringLiteral(fnName),
              start,
              end,
              funcScopeId, // Use the retrieved _funcScopeId
              thisBinding,
              t.nullLiteral() // Always pass callSiteLine as null from Function visitor
            ]
          )
        );
        const errorMessageExpr = t.logicalExpression('||',
            t.memberExpression(errorParam, t.identifier("message")),
            t.stringLiteral('Unknown Error')
        );
        const errorCall = t.expressionStatement( // Fixed placeholder
          t.callExpression(
            t.memberExpression(t.identifier("Tracer"), t.identifier("errorFunc")),
            [errorMessageExpr, traceId, t.stringLiteral(fnName), start, end]
          )
        );
        // REMOVED incorrect/redundant exitCall definition.
        // The actual exit call is handled by the ReturnStatement visitor.
        const throwStmt = t.throwStatement(errorParam);


        // --- ENABLED Function Body Instrumentation ---
        // 5. Create the try/catch/finally structure (Copied from user feedback)
        const currentBodyBlock = functionBodyPath.node;
        const catchClause = t.catchClause(errorParam, t.blockStatement([errorCall, throwStmt]));
        // Remove exitCall from finally, it will be handled by ReturnStatement visitor
        const finallyBlock = t.blockStatement([]); // Empty finally for now
        const tryCatchFinally = t.tryStatement(
          currentBodyBlock,
          catchClause,
          finallyBlock // Now potentially empty
        );

        // Duplicated block removed

        // 6. Create the new overall function body block (Copied from user feedback)
        const newBody = t.blockStatement([
          t.variableDeclaration("const", [t.variableDeclarator(traceId, t.callExpression(t.identifier("nextId"), []))]),
          enterCall, // enterCall is now correctly defined above
          tryCatchFinally
        ]);

        // 7. Mark the *new* body block as traced (Copied from user feedback)
        newBody[FUNCTION_TRACED] = true;


        // Add logs before and after critical steps like replaceWith
        try {
            console.log(`[traceFunctions] Replacing body for: ${fnName}`); // Use determined fnName

            // --- Attempt to copy location info ---
            t.inherits(newBody, functionBodyPath.node); // Use Babel's inheritance helper
            // --- End loc copy attempt ---

            functionBodyPath.replaceWith(newBody); // <<< ENABLED BODY REPLACEMENT
            console.log(`[traceFunctions] Body replacement completed for: ${fnName}`);

            console.log(`[traceFunctions] Crawling scope for: ${fnName}`);
            path.scope.crawl();
            console.log(`[traceFunctions] Scope crawled for: ${fnName}`);

        } catch (e) {
            console.error(`[traceFunctions] !!!!! ERROR during instrumentation !!!!!`, e);
            // Log details about the path/node if possible
            console.error(`[traceFunctions] Error occurred on node type: ${path.node.type}, name: ${fnName}`);
        }
        // --- END ENABLED ---

        // Keep the explicit traversal for CallExpressions even without body replacement
        console.log(`[traceFunctions] Traversing for CallExpressions within: ${fnName}`);
        path.traverse({
            CallExpression: instrumentCallExpression // Use the helper function
        });
        // --- End CallExpression traversal ---

        // Mark the original function node as traced (even though body wasn't replaced)
        path.node[FUNCTION_TRACED] = true;

      },

      // --- ENABLED ReturnStatement Instrumentation ---
      ReturnStatement(path, state) {
        // Ensure this return is directly within a function we've instrumented, not a nested one.
        const funcPath = path.getFunctionParent();
        if (!funcPath || !funcPath.isFunction() || !funcPath.node?.body?.[FUNCTION_TRACED]) {
            // If the parent function's body wasn't marked by our Function visitor, skip.
            // This check might need refinement depending on exact visitor order and marking strategy.
            // console.log("[traceFunctions] Skipping ReturnStatement in non-instrumented/nested function.");
            return;
        }

        console.log(`[traceFunctions] Instrumenting ReturnStatement at line: ${path.node.loc?.start.line}`);

        // 1. Capture original return value and line
        const originalArgument = path.node.argument;
        const returnLine = path.node.loc ? t.numericLiteral(path.node.loc.start.line) : t.nullLiteral();

        // 2. Create temporary variable
        const tempVarId = path.scope.generateUidIdentifier("_tempReturnValue");
        const tempVarDecl = t.variableDeclaration("const", [
            t.variableDeclarator(
                tempVarId,
                originalArgument ? t.cloneNode(originalArgument) : t.identifier('undefined') // Clone to avoid issues
            )
        ]);
        t.inherits(tempVarDecl, path.node); // Attempt to copy location

        // 3. Re-gather info needed for Tracer.exitFunc
        // traceId should be in scope from the Function visitor's newBody
        // Retrieve traceIdName from scope data

        let fnName = 'anonymous';
        if (funcPath.node.id) {
            fnName = funcPath.node.id.name;
        } else if (funcPath.parentPath.isVariableDeclarator() && funcPath.parentPath.get('id').isIdentifier()) {
            fnName = funcPath.parentPath.get('id').node.name;
        } else if (funcPath.parentPath.isObjectProperty() && funcPath.parentPath.get('key').isIdentifier()) {
           fnName = funcPath.parentPath.get('key').node.name;
        } else if (funcPath.parentPath.isClassMethod()) {
           fnName = funcPath.parentPath.get('key').node.name;
        }
        const start = funcPath.node.loc ? t.numericLiteral(funcPath.node.loc.start.line) : t.nullLiteral();
        const end = funcPath.node.loc ? t.numericLiteral(funcPath.node.loc.end.line) : t.nullLiteral();

        // --- Accurate Scope ID Lookup (closure-aware) ---
        // Always use the innermost function's _funcScopeId if present
        let scopeId = "global"; // Default

        if (funcPath && funcPath.node) {
            if (Object.prototype.hasOwnProperty.call(funcPath.node, '_funcScopeId')) {
                scopeId = funcPath.node._funcScopeId;
                console.log(`[traceFunctions ReturnStatement] Using innermost function scopeId '${scopeId}' for return in ${fnName} (closure-aware).`);
            } else {
                // Function scope found but _funcScopeId missing: warn and do NOT default to global
                if (funcPath.isFunction()) {
                    console.warn(`[traceFunctions ReturnStatement] Function scope found for '${fnName}' but _funcScopeId missing! This is likely a bug. Marking scopeId as 'unknown-missing-funcScopeId'.`);
                    scopeId = "unknown-missing-funcScopeId";
                } else {
                    // Not in a function, use global
                    scopeId = "global";
                    console.warn(`[traceFunctions ReturnStatement] Not in a function scope for ${fnName}, using 'global'.`);
                }
            }
        } else {
            // No function path, use global
            scopeId = "global";
            console.warn(`[traceFunctions ReturnStatement] No funcPath for ${fnName}, using 'global'.`);
        }
        console.log(`[traceFunctions ReturnStatement] Using exitingScopeId: ${scopeId} for function: ${fnName}`);
        // --- End Accurate Scope ID Lookup ---

         // Find the traceId identifier declared in the function scope
        let traceIdIdentifier;
        // const funcPath = path.getFunctionParent(); // Already defined above

        if (funcPath && funcPath.scope) {
            // Attempt 1: Find binding by the original base name "traceId"
            // Babel's scope analysis should handle the unique generated name (_traceIdX)
            const binding = funcPath.scope.getBinding("traceId");

            if (binding && binding.identifier) {
                 traceIdIdentifier = binding.identifier;
                 console.log(`[traceFunctions ReturnStatement] Found traceId binding identifier (name: '${traceIdIdentifier.name}') via getBinding.`);
            } else {
                 // Attempt 2: If getBinding didn't work, manually find the VariableDeclarator
                 // This relies on the structure created by the Function visitor (const _traceId = nextId();)
                 console.log(`[traceFunctions ReturnStatement] getBinding('traceId') failed. Attempting manual search...`);
                 const functionBodyPaths = funcPath.get('body.body'); // Path to the array of statement paths
                 if (Array.isArray(functionBodyPaths)) {
                     const traceIdDeclarationPath = functionBodyPaths.find(
                         stmtPath => stmtPath.isVariableDeclaration() &&
                                     stmtPath.node.declarations.length > 0 &&
                                     stmtPath.node.declarations[0]?.id?.name?.startsWith('_traceId') // Heuristic match based on Function visitor
                     );
                     if (traceIdDeclarationPath) {
                         traceIdIdentifier = traceIdDeclarationPath.node.declarations[0].id;
                         console.log(`[traceFunctions ReturnStatement] Found traceId identifier (name: '${traceIdIdentifier.name}') via manual search.`);
                     } else {
                         console.log(`[traceFunctions ReturnStatement] Manual search for traceId declaration also failed.`);
                     }
                 } else {
                      console.log(`[traceFunctions ReturnStatement] Could not get function body paths for manual search.`);
                 }
            }
        } else {
             console.log(`[traceFunctions ReturnStatement] Could not get function path or scope.`);
        }

        // Fallback if neither method worked
        if (!traceIdIdentifier) {
            console.error("[traceFunctions ReturnStatement] CRITICAL: Could not find traceId binding or identifier!");
            // Using the generated name pattern as a last resort fallback is risky but might prevent crashes
            traceIdIdentifier = t.identifier("_traceId"); // Very risky fallback
            console.warn(`[traceFunctions ReturnStatement] Falling back to risky identifier: ${traceIdIdentifier.name}`);
        }

        // 4. Create the specific Tracer.exitFunc call
        console.log(`[traceFunctions ReturnStatement] constructing exitCallSpecific: fnName=${fnName}, exitingScopeId=${scopeId}, tempReturnVar=${tempVarId.name}, returnLine=${path.node.loc?.start.line}, originalArgument=${JSON.stringify(originalArgument)}`);
        const exitCallSpecific = t.expressionStatement(
            t.callExpression(
                t.memberExpression(t.identifier("Tracer"), t.identifier("exitFunc")),
                [
                    traceIdIdentifier,
                    t.stringLiteral(fnName),
                    start,
                    end,
                    t.stringLiteral(scopeId), // exitingScopeId
                    tempVarId, // The captured return value
                    returnLine // Line of the original return statement
                ]
            )
        );
        t.inherits(exitCallSpecific, path.node); // Attempt to copy location
        console.log(`[traceFunctions ReturnStatement] exitCallSpecific AST: ${JSON.stringify(exitCallSpecific)}`);

        // 5. Create the new return statement
        const newReturnStmt = t.returnStatement(tempVarId);
        t.inherits(newReturnStmt, path.node); // Attempt to copy location

        // 6. Create the replacement block
        const replacementBlock = t.blockStatement([
            tempVarDecl,
            exitCallSpecific,
            newReturnStmt
        ]);
        t.inherits(replacementBlock, path.node); // Attempt to copy location

        // 7. Replace the original ReturnStatement path
        try {
            const newPaths = path.replaceWith(replacementBlock); // Get path(s) to the new block
            console.log(`[traceFunctions] Replaced ReturnStatement with block at line: ${path.node?.loc?.start.line || 'unknown'}`);

            // --- Explicitly traverse returned function body ---
            // Check if the original argument was a function expression
            if (originalArgument && (t.isFunctionExpression(originalArgument) || t.isArrowFunctionExpression(originalArgument))) {
                console.log("[traceFunctions ReturnStatement] Original return value was a function. Attempting to requeue...");
                // Find the path to the FunctionExpression within the new block.
                // It's the init value of the tempVarDecl (the first statement).
                const blockPath = Array.isArray(newPaths) ? newPaths[0] : path; // Use path if replaceWith doesn't return array
                const tempVarDeclPath = blockPath.get('body.0');
                if (tempVarDeclPath && tempVarDeclPath.isVariableDeclaration()) {
                    const funcExprPath = tempVarDeclPath.get('declarations.0.init');
                    if (funcExprPath && (funcExprPath.isFunctionExpression() || funcExprPath.isArrowFunctionExpression())) {
                        // --- Explicitly visit the FunctionExpression path ---
                        console.log("[traceFunctions ReturnStatement] Explicitly visiting FunctionExpression path.");
                        funcExprPath.visit();
                        // --- End explicit visit ---
                    } else {
                         console.warn("[traceFunctions ReturnStatement] Could not find FunctionExpression path in tempVarDecl for requeue.");
                    }
                } else {
                     console.warn("[traceFunctions ReturnStatement] Could not find tempVarDecl path for requeue.");
                }
            }
            // --- End explicit traversal ---

            path.skip(); // Prevent re-visiting the nodes within the *replacement block* itself immediately
        } catch (e) {
            console.error(`[traceFunctions] !!!!! ERROR during ReturnStatement replacement !!!!!`, e);
            console.error(`[traceFunctions] Error occurred on ReturnStatement at line: ${path.node?.loc?.start.line || 'unknown'}`);
        }
      },
      // --- END ENABLED ---

      // Add Program.exit to see if the visitor ran at all during the file processing
      Program: {
          exit() {
              if (!visitorRan) {
                   console.warn("[traceFunctions] WARNING: Function visitor never ran during Babel pass!");
              } else {
                   console.log("[traceFunctions] Visitor pass completed.");
              }
          }
      }
    },
  };
};
