// backend/src/worker/traceFunctions.js
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
        const finallyBlock = t.blockStatement([exitCall]);
        const tryCatchFinally = t.tryStatement(
          currentBodyBlock,
          catchClause,
          finallyBlock
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
