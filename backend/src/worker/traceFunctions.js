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

  return {
    visitor: {
      Function(path) {
        visitorRan = true; // Mark that the visitor was entered
        console.log(`[traceFunctions] Entered Function visitor for node type: ${path.node.type}, Name: ${path.node.id?.name || '(anon)'}`); // Log entry

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

        // Retrieve scopeId from traceScope.js
        let scopeId = "global";
        if (path.scope && path.scope.data && path.scope.data.scopeId) {
          scopeId = path.scope.data.scopeId;
        }

        // Placeholders for thisBinding and callSiteLine (can be null for now)
        const thisBinding = t.nullLiteral();
        const callSiteLine = t.nullLiteral();

        // 4. Create Tracer calls as AST nodes (Copied from user feedback & FIXED placeholders)
        const enterCall = t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.identifier("Tracer"), t.identifier("enterFunc")),
            [
              traceId,
              t.stringLiteral(fnName),
              start,
              end,
              t.stringLiteral(scopeId), // newScopeId
              thisBinding,
              callSiteLine
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
        const exitCall = t.expressionStatement( // Fixed placeholder
          t.callExpression(
            t.memberExpression(t.identifier("Tracer"), t.identifier("exitFunc")),
            [
              traceId,
              t.stringLiteral(fnName),
              start,
              end,
              t.stringLiteral(scopeId), // exitingScopeId
              t.nullLiteral(), // returnValue placeholder
              t.nullLiteral()  // returnLine placeholder
            ]
          )
        );
        const throwStmt = t.throwStatement(errorParam);


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

            functionBodyPath.replaceWith(newBody); // newBody is the BlockStatement with try/catch etc.
            console.log(`[traceFunctions] Body replaced successfully for: ${fnName}`);

            console.log(`[traceFunctions] Crawling scope for: ${fnName}`);
            path.scope.crawl();
            console.log(`[traceFunctions] Scope crawled for: ${fnName}`);

        } catch (e) {
            console.error(`[traceFunctions] !!!!! ERROR during instrumentation !!!!!`, e);
            // Log details about the path/node if possible
            console.error(`[traceFunctions] Error occurred on node type: ${path.node.type}, name: ${fnName}`);
        }
      },

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

        // --- Correct Scope ID Lookup ---
        // Get the scope ID directly from the function node property set by traceScope.js
        let scopeId = "global"; // Default
        let foundScope = false;
        if (funcPath && funcPath.node && funcPath.node._funcScopeId) {
            scopeId = funcPath.node._funcScopeId;
            foundScope = true;
            console.log(`[traceFunctions ReturnStatement] Found scopeId '${scopeId}' on funcPath.node._funcScopeId`);
        } else {
            // Traverse up the scope chain to find a parent function node with _funcScopeId
            let parentScope = funcPath && funcPath.scope ? funcPath.scope.parent : null;
            while (parentScope) {
                if (
                    parentScope.block &&
                    (parentScope.block.type === "FunctionDeclaration" ||
                     parentScope.block.type === "FunctionExpression" ||
                     parentScope.block.type === "ArrowFunctionExpression") &&
                    parentScope.block._funcScopeId
                ) {
                    scopeId = parentScope.block._funcScopeId;
                    foundScope = true;
                    console.log(`[traceFunctions ReturnStatement] Found scopeId '${scopeId}' on parentScope.block._funcScopeId`);
                    break;
                }
                parentScope = parentScope.parent;
            }
            if (!foundScope) {
                console.warn(`[traceFunctions ReturnStatement] Could not find _funcScopeId on funcPath node or any parent function node for ${fnName}. Defaulting to 'global'. funcPath node:`, funcPath?.node);
            }
        }
        console.log(`[traceFunctions ReturnStatement] Using exitingScopeId: ${scopeId} for function: ${fnName}`);
        // --- End Correct Scope ID Lookup ---

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
