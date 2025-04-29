// --- Mock Tracer and nextId for standalone execution ---
let _nextIdCounter = 0;
function nextId() { return _nextIdCounter++; }
const Tracer = {
    events: [],
    logEvent(event) {
        console.log(JSON.stringify(event)); // Output raw events as JSON strings
        this.events.push(event);
    },
    varWrite(scopeId, name, value, type, line) {
        this.logEvent({ type: 'VarWrite', scopeId, name, value: typeof value === 'function' ? 'function' : value, valueType: type, line });
        return value; // Important: return the value for assignments
    },
    enterFunc(traceId, name, start, end, scopeId, thisBinding, callSiteLine) {
        this.logEvent({ type: 'EnterFunction', traceId, name, start, end, scopeId, thisBinding, callSiteLine });
    },
    exitFunc(traceId, name, start, end, exitingScopeId, returnValue, returnLine) {
        this.logEvent({ type: 'ExitFunction', traceId, name, start, end, exitingScopeId, returnValue: typeof returnValue === 'function' ? 'function' : returnValue, returnLine });
    },
    errorFunc(message, traceId, name, start, end) {
        this.logEvent({ type: 'ErrorFunction', message, traceId, name, start, end });
    },
    captureLocals(scopeId, parentScopeId, locals) {
         // Convert locals object to the desired format if needed, or just log
         this.logEvent({ type: 'CaptureLocals', scopeId, parentScopeId, locals: locals || {} });
    },
    captureClosure(closureId, scopeId, freeVars) {
        // Convert freeVars object if needed
        this.logEvent({ type: 'Closure', closureId, scopeId, freeVars: freeVars || {} });
    },
    varRead(name, value) { // Mock varRead used in catch block
        // This might need more sophisticated handling depending on actual use
        return value;
    }
};
// --------------------------


// --- Final Generated Code (from LAST transformation output) ---
function createCounter() {
  const _traceId = nextId();
  Tracer.enterFunc(_traceId, "createCounter", 1, 7, "global", null, null);
  try {
    Tracer.captureLocals("funcScopeId-802823", "global", {});
    let count = 0; // Declaration
    Tracer.varWrite("funcScopeId-802823", "count", count, "number");
    {
      const _tempReturnValue = function () {
        const _traceId2 = nextId();
        Tracer.enterFunc(_traceId2, "_tempReturnValue", 3, 6, "global", null, null);
        try {
          Tracer.captureLocals("funcScopeId-544195", "global", {});
          count = Tracer.varWrite("funcScopeId-802823", "count", count + 1, "BinaryExpression", 4); // Assignment
          {
            const _tempReturnValue2 = count;
            Tracer.exitFunc(_traceId2, "_tempReturnValue", 3, 6, "funcScopeId-544195", _tempReturnValue2, 5);
            return _tempReturnValue2;
          }
        } catch (_err2) {
          Tracer.errorFunc(_err2.message || "Unknown Error", _traceId2, "_tempReturnValue", 3, 6);
          throw Tracer.varRead("_err2", _err2);
        } finally {}
      };
      Tracer.captureClosure("closure-213838", "funcScopeId-544195", {
        count
      });
      Tracer.exitFunc(_traceId, "createCounter", 1, 7, "funcScopeId-802823", _tempReturnValue, 3);
      return _tempReturnValue;
    }
  } catch (_err) {
    Tracer.errorFunc(_err.message || "Unknown Error", _traceId, "createCounter", 1, 7);
    throw Tracer.varRead("_err", _err);
  } finally {}
}
const counter = createCounter();
Tracer.varWrite("global", "counter", counter, "CallExpression");
counter(); // First call, count becomes 1
counter(); // Second call, count becomes 2
// --------------------------