# Story Events Specification (Enhanced for Scope & Variable Context)

This document defines the high-level **story** events consumed by the frontend visualization UI. Each event has a `type` and a `payload` with the fields described below.  
**This schema is the contract for all backend-to-frontend event data.**

---

## Scope Object Structure

A **Scope** object represents a lexical or closure scope at a given execution point.

```json
{
  "scopeId": "global | func-1 | closure-0", // Unique ID for this scope
  "type": "global | function | closure",    // Scope kind
  "name": "createCounter",                  // Human-readable name, e.g. function name or 'global'
  "variables": {
    "x": { "value": 1, "type": "number" },
    "y": { "value": "foo", "type": "string" }
    // ...other variables
  },
  "parentId": "global | func-0 | null",     // Parent scope's ID, or null for global
  "isPersistent": true,                     // (optional) True if closure scope persists after function exit
  "thisBinding": null                       // (optional) Value of 'this' in this scope, if relevant
}
```

---

## 1. STEP_LINE

Emitted when the interpreter moves to a new source location.  
**Now includes a snapshot of all active scopes at this line.**

```json
{
  "type": "STEP_LINE",
  "payload": {
    "line": 42,         // 1-based line number
    "col": 3,           // 1-based column number
    "snippet": "const x = add(a, b);", // full source line or excerpt
    "scopes": [ /* Array of Scope objects representing all active/visible scopes at this line */ ],
    "statementType": "assignment", // (optional) e.g. 'assignment', 'call', 'return', etc.
    "heap": {
      // Maps heapId to the current serialized heap object/array structure at this step.
      // This snapshot reflects all heap objects/arrays visible at this line.
      // Example:
      "h1": { "type": "object", "heapId": "h1", "properties": { ... } },
      "h2": { "type": "array", "heapId": "h2", "elements": [ ... ] }
    }
  }
}
```

---

## 2. CALL

Emitted when a function is entered.

```json
{
  "type": "CALL",
  "payload": {
    "funcName": "add",         // Name of the function
    "args": [1, 2],            // Argument values
    "callSiteLine": 10,        // Line where the call happened (always accurate; correlated from BeforeCall event)
    "newScopeId": "func-1",    // ID of the scope created for this call
    "closureScopeId": "closure-0", // (optional) ID of closure scope captured, if any
    "thisBinding": null        // (optional) 'this' value for the call
  }
}
```

---

## 3. RETURN

Emitted when a function exits.

```json
{
  "type": "RETURN",
  "payload": {
    "funcName": "add",         // Name of the function
    "returnValue": 3,          // Value returned (undefined if none)
    "returnLine": 15,          // Line where the return statement is
    "exitingScopeId": "func-1" // Scope being popped (function-specific, e.g. "funcScopeId-XXXX"). Only "global" if returning from global scope (rare).
  }
}
```

---

## 4. ASSIGN

Emitted when a variable is written to.

```json
{
  "type": "ASSIGN",
  "payload": {
    "varName": "x",            // Variable name
    "newValue": 3,             // New value after assignment
    // If assigned value is a heap object/array, newValue is a reference:
    // { "type": "reference", "heapId": "h1", "valueType": "object" }
    "valueType": "number",     // Type of the value assigned
    "scopeId": "global",       // Scope where the assignment happened ("global" for global scope, otherwise function-specific e.g. "funcScopeId-XXXX")
    "line": 6                  // Line where assignment occurred
  }
}
```

### Notes on `scopeId` and `exitingScopeId`

- For variables assigned or updated inside a function, `scopeId` will be the function's unique scope ID (e.g., `"funcScopeId-1234"`).
- For variables assigned in the global scope, `scopeId` will be `"global"`.
- For RETURN events, `exitingScopeId` will be the function's unique scope ID. Only `"global"` if returning from the global scope (rare).
- If a function scope is found but its `_funcScopeId` is missing, the backend will emit a warning and may use `"unknown-missing-funcScopeId"` for debugging.
- If no function or program scope can be determined, `"unknown-no-scope"` may be used for debugging.
- Frontend consumers should treat `"unknown-missing-funcScopeId"` and `"unknown-no-scope"` as indicators of a backend instrumentation bug.

#### Example: Nested/Closure Scopes

```json
{
  "type": "ASSIGN",
  "payload": {
    "varName": "y",
    "newValue": 42,
    "valueType": "number",
    "scopeId": "funcScopeId-5678", // Assigned inside a closure or nested function
    "line": 12
  }
}
```

---

## 5. CONSOLE

Emitted when a console statement occurs.

```json
{
  "type": "CONSOLE",
  "payload": {
    "text": "Hello, world!"    // Printed message
  }
}
```

---

## 6. HEAP_UPDATE

Emitted when a new heap object or array is created or updated.

```json
{
  "type": "HEAP_UPDATE",
  "payload": {
    "heapId": "h1",                // Unique heap object/array ID
    "type": "object" | "array",    // Heap value type
    "value": { ... }               // Serialized structure (see below)
  }
}
```

- For objects: `{ "type": "object", "heapId": "h1", "properties": { ... } }`
- For arrays: `{ "type": "array", "heapId": "h2", "elements": [ ... ] }`
- Circular references are represented as `{ "type": "circular", "heapId": "hN" }`
- Depth-limited objects/arrays are represented as `{ "type": "object"|"array", "heapId": "hN" }` (without properties/elements)

---

### Notes

- The backend emits a `BeforeCall` event immediately before each function call, containing the `callSiteLine`.
- The reducer correlates each `CALL` event with the most recent `BeforeCall` to ensure `callSiteLine` is always accurate, even for nested or chained calls.
- Internal events like `BeforeCall` are not included in the final story event stream.


- All values (including variables and thisBinding) should be serialized for display (e.g., using JSON or a pretty-printer).
- The `scopes` array in `STEP_LINE` should include all currently visible scopes (global, current function, closures, etc.), with correct parentId links.
- Additional event types or fields may be added as needed for future UI features, but these are the required fields for Phase 1.

*All other internal or low-level events (e.g. microtask enqueues, raw AST steps, promise hooks) are filtered out by the `StoryReducer` and should **not** appear in the final story event stream.*
