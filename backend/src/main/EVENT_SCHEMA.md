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
    "statementType": "assignment" // (optional) e.g. 'assignment', 'call', 'return', etc.
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
    "callSiteLine": 10,        // Line where the call happened
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
    "exitingScopeId": "func-1" // Scope being popped
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
    "valueType": "number",     // Type of the value assigned
    "scopeId": "global",       // Scope where the assignment happened
    "line": 6                  // Line where assignment occurred
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

### Notes

- All values (including variables and thisBinding) should be serialized for display (e.g., using JSON or a pretty-printer).
- The `scopes` array in `STEP_LINE` should include all currently visible scopes (global, current function, closures, etc.), with correct parentId links.
- Additional event types or fields may be added as needed for future UI features, but these are the required fields for Phase 1.

*All other internal or low-level events (e.g. microtask enqueues, raw AST steps, promise hooks) are filtered out by the `StoryReducer` and should **not** appear in the final story event stream.*
