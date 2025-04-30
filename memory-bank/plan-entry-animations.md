# Plan: Implement Entry Animations for React Flow Nodes

This plan outlines the steps to add entry animations for new nodes (stack frames, heap objects) in the React Flow visualization, enhancing visual feedback during step-by-step code execution.

**Goal:** Make it visually clear when new elements appear in the diagram between execution steps.

**Approach:**

1.  **Track Node Changes:** Modify `VisualizationState.tsx` to identify newly added nodes by comparing current nodes with the previous step's nodes.
2.  **Signal New Nodes:** Pass an `isNew` flag via node data to custom node components.
3.  **Apply Animations:** Use the `isNew` flag in custom nodes to trigger CSS-based entry animations.

**Detailed Steps:**

1.  **Modify `src/components/VisualizationState.tsx`:**
    *   Add state for previous node IDs: `const [previousNodeIds, setPreviousNodeIds] = useState<Set<string>>(new Set());`
    *   In the main `useEffect`:
        *   Calculate `currentNodeIds`: `new Set(newNodes.map(n => n.id))`
        *   Calculate `addedNodeIds`: `new Set([...currentNodeIds].filter(id => !previousNodeIds.has(id)))`
        *   Map `newNodes` to `animatedNodes`, adding `data: { ...node.data, isNew: addedNodeIds.has(node.id) }`.
        *   Call `setNodes(animatedNodes);`
        *   Call `setPreviousNodeIds(currentNodeIds);` (after `setNodes`)
        *   Ensure `previousNodeIds` is *not* in the `useEffect` dependency array.

2.  **Modify Custom Node Components (`src/components/flow/FrameNode.tsx`, `src/components/flow/HeapObjectNode.tsx`, `src/components/flow/PersistentEnvNode.tsx`):**
    *   For *each* component:
        *   Import `useEffect`, `useRef`.
        *   Create `nodeRef = useRef<HTMLDivElement>(null);`
        *   Add `useEffect(() => { ... }, [data.isNew]);`
        *   Inside `useEffect`, if `data.isNew` is true:
            *   Get `element = nodeRef.current;`
            *   Add class: `element.classList.add('node-enter-active');`
            *   Optional: Use `setTimeout` to remove the class after animation (e.g., 500ms).
        *   Assign `ref={nodeRef}` to the main wrapper `div`.

3.  **Add CSS Animations in `src/index.css`:**
    *   Define `@keyframes node-enter-animation`:
        ```css
        @keyframes node-enter-animation {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        ```
    *   Define `.node-enter-active`:
        ```css
        .node-enter-active {
          animation: node-enter-animation 0.5s ease-out forwards;
        }
        ```

4.  **Testing:**
    *   Run the application.
    *   Step through code examples involving function calls and object/array creation.
    *   Verify smooth entry animations for new nodes.

**Diagrammatic Flow:**

```mermaid
graph TD
    A[State Update Triggered] --> B{VisualizationState useEffect};
    B --> C[Calculate newNodes/newEdges];
    C --> D[Get currentNodeIds];
    D --> E[Compare with previousNodeIds];
    E --> F[Identify addedNodeIds];
    F --> G[Map newNodes to animatedNodes (add isNew flag)];
    G --> H[setNodes(animatedNodes)];
    H --> I[Render Custom Nodes (FrameNode, etc.)];
    I -- contains isNew=true --> J{Node Component useEffect};
    J --> K[Add .node-enter-active class];
    K --> L[CSS applies @keyframes];
    L --> M[Node animates in];
    M --> N[setTimeout removes class];
    G --> O[setPreviousNodeIds(currentNodeIds)];

    style K fill:#f9f,stroke:#333,stroke-width:2px
    style L fill:#ccf,stroke:#333,stroke-width:2px