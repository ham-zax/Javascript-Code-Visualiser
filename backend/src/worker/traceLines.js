// backend/src/worker/traceLines.js
const STEP_ADDED = Symbol("stepAdded");
const SKIP_NAMES = new Set([
  'Tracer',
  'nextId',
  'fetch',
  '_',
  'lodash',
  'console',
  'setTimeout',
  'queueMicrotask'
]);

// Corrected function signature to accept (babel, options)
module.exports = function traceLines(babel, options = {}) { // Use standard signature
    console.log('[traceLines] >>> Received options argument:', options); // Log the options object
    const { types: t } = babel; // Extract types after logging
    const originalSource = options ? options.originalSource : null; // Safer access
  const originalLines = originalSource ? originalSource.split('\n') : null;

  // Add log to verify originalLines
  console.log(`[traceLines] Initialized. originalLines: ${originalLines ? `Array[${originalLines.length}]` : 'null'}`);

  return {
    visitor: {
      Statement(path) {
        // Use preserved location as fallback
        const effectiveLoc = path.node.loc || path.node.__origLoc;
        const currentLine = effectiveLoc?.start?.line;

        console.log(`[traceLines] Visiting ${path.type} at effective L${currentLine || '?'}`);

        // --- Check specifically for L5 using effective location ---
        let isL5ExprStmt = false;
        if (currentLine === 5 && path.isExpressionStatement()) {
            isL5ExprStmt = true;
            const hasLoc = !!path.node.loc;
            const hasOrigLoc = !!path.node.__origLoc;
            console.log(`[traceLines] >>> Inspecting L5 Node: Has .loc? ${hasLoc}. Has .__origLoc? ${hasOrigLoc}.`);
            if (hasOrigLoc) console.log("[traceLines] L5 __origLoc Content:", JSON.stringify(path.node.__origLoc));
            if (hasLoc) console.log("[traceLines] L5 .loc Content:", JSON.stringify(path.node.loc));
        }
        // --- End L5 check ---

        if (path.isFunctionDeclaration()) {
            console.log(`[traceLines] Skipping FunctionDeclaration.`);
            return; // Skip these
        }
        if (path.node[STEP_ADDED]) {
            console.log(`[traceLines] Skipping already instrumented node L${currentLine || '?'}`);
            return; // Skip already processed
        }
        // Skip internal calls (check before loc) - simplified check
        if (path.isExpressionStatement() && path.get('expression').isCallExpression()) {
          const callee = path.get('expression.callee');
          if (callee.isIdentifier() && SKIP_NAMES.has(callee.node.name)) {
             console.log(`[traceLines] Skipping internal call statement (direct).`);
             return;
          }
          if (callee.isMemberExpression() && callee.get('object').isIdentifier() && SKIP_NAMES.has(callee.get('object').node.name)) {
             console.log(`[traceLines] Skipping internal call statement (member).`);
             return;
          }
        }

        // --- Determine if step can be added based on effectiveLoc ---
        let canAddStep = false;
        let line, column, originalSnippet = "";

        // CRITICAL: Check originalLines here
        if (effectiveLoc && effectiveLoc.start && effectiveLoc.start.line != null && originalLines) {
             line = effectiveLoc.start.line;
             column = effectiveLoc.start.column;
             const lineIndex = line - 1;
             if (lineIndex >= 0 && lineIndex < originalLines.length) {
                 originalSnippet = originalLines[lineIndex].trim();
                 canAddStep = true;
                 if(line === 5) console.log(`[traceLines] L5 - canAddStep is TRUE.`);
             } else {
                 console.warn(`[traceLines] Line number ${line} out of bounds. Snippet unavailable.`);
             }
        } else {
            // Log why it failed
            if (isL5ExprStmt) {
                 console.log(`[traceLines] L5 Node cannot add step. Reason: effectiveLoc=${!!effectiveLoc}, start=${!!effectiveLoc?.start}, line=${effectiveLoc?.start?.line}, originalLines=${!!originalLines}`);
            } else {
                 console.log(`[traceLines] Node cannot add step at L${currentLine || '?'}. Reason: effectiveLoc=${!!effectiveLoc}, start=${!!effectiveLoc?.start}, line=${effectiveLoc?.start?.line}, originalLines=${!!originalLines}`);
            }
        }
        // --- End Check ---

        if (canAddStep) {
            // Create call statement using the determined line, column, and snippet
            const callStatement = t.expressionStatement(
              t.callExpression(
                t.memberExpression(t.identifier("Tracer"), t.identifier("step")),
                [t.numericLiteral(line), t.numericLiteral(column), t.stringLiteral(originalSnippet)]
              )
            );
            callStatement[STEP_ADDED] = true; // Mark generated node

            console.log(`[traceLines] Preparing step for L${line}: "${originalSnippet}".`);
            const parentBlockOrProgram = path.findParent((p) => p.isBlockStatement() || p.isProgram());
            if (parentBlockOrProgram) {
                 // Find the key and index where the current statement resides within the parent's body
                 let found = false;
                 const bodyKey = parentBlockOrProgram.node.body && Array.isArray(parentBlockOrProgram.node.body) ? 'body' :
                               parentBlockOrProgram.node.directives && Array.isArray(parentBlockOrProgram.node.directives) ? 'directives' :
                               null;

                 if (bodyKey) {
                    const bodyPaths = parentBlockOrProgram.get(bodyKey);
                    if (Array.isArray(bodyPaths)) {
                        for (let i = 0; i < bodyPaths.length; i++) {
                            if (bodyPaths[i].node === path.node) {
                                console.log(`[traceLines] Found statement at index ${i} in parent ${parentBlockOrProgram.type}. Inserting step before index ${i}.`);
                                try {
                                     bodyPaths[i].insertBefore(callStatement); // Insert before the path at this index
                                     console.log(`[traceLines] Inserted step successfully for L${line}.`);
                                     path.node[STEP_ADDED] = true; // Mark original node
                                     found = true;
                                     break; // Exit loop once inserted
                                } catch (e) {
                                    console.error(`[traceLines] !!!!! ERROR during insertBefore (index ${i}) !!!!! for ${path.type} at L${line}.`, e);
                                }
                            }
                        }
                    } else {
                         console.warn(`[traceLines] Parent body path (${bodyKey}) is not an array for L${line}. Cannot insert step.`);
                    }
                } else {
                     console.warn(`[traceLines] Could not determine body key for parent ${parentBlockOrProgram.type} for L${line}. Cannot insert step.`);
                }

                if (!found && !path.removed) {
                     console.warn(`[traceLines] Could not find exact path index for L${line} in parent block OR path was removed. Step not added.`);
                }
            } else {
                 console.warn(`[traceLines] Could not find BlockStatement/Program parent for L${line}. Step not added.`);
            }
        }
        // No path.skip()
      }
    }
  };
};
