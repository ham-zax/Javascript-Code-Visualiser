# JS Visualiser

JS Visualiser is an interactive tool for visualizing JavaScript code execution, variable states, and memory management. It helps users understand how code flows, how variables change, and how the call stack and heap evolve during execution. The project features accurate data tracking and rich visualizations for educational and debugging purposes.

## Architecture Overview

```mermaid
graph TD
    A[User Interface (React)] --> B[Visualization Components]
    B --> C[Playback & State Management]
    C --> D[Backend API (Node.js)]
    D --> E[Execution Engine & Tracing]
    E --> F[Data Storage & Event Processing]
    F --> B
```

## Tutorial Chapters

- [Introduction](#)  
- [Getting Started](#)  
- [Understanding the UI](#)  
- [Code Execution Flow](#)  
- [Visualizing Variables](#)  
- [Call Stack & Heap](#)  
- [Advanced Features](#)  
- [Troubleshooting](#)  
- [FAQ](#)