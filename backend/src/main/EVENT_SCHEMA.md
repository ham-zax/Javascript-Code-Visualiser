# Story Events Specification

This document defines the minimal set of high-level **story** events that the frontend visualization UI consumes. Each event has a `type` and a `payload` with the fields described below.

---

## 1. STEP_LINE
Emitted when the interpreter moves to a new source location.

```json
{
  "type": "STEP_LINE",
  "payload": {
    "line": 42,         // 1-based line number
    "col": 3,           // 1-based column number
    "snippet": "const x = add(a, b);" // full source line or excerpt
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
    "funcName": "add",   // name of the function
    "args": [1, 2]         // argument values
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
    "funcName": "add",    // name of the function
    "returnValue": 3        // value returned (undefined if none)
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
    "varName": "x",       // variable name
    "newValue": 3           // new value after assignment
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
    "text": "Hello, world!" // printed message
  }
}
```

---

*All other internal or low-level events (e.g. microtask enqueues, raw AST steps, promise hooks) are filtered out by the `StoryReducer` and should **not** appear in the final story event stream.*
