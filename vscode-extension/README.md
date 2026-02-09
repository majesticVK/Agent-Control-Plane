# Agent Control Plane (ACP) VS Code Extension

The **ACP Extension** provides a deterministic replay debugger for AI agents. It functions as a control-plane instrumentation tool, allowing you to audit, replay, and inspect agent behavior using strictly captured artifacts.

## Features

### 1. Timeline Visualization
A forensic view of the agent's execution history.
- **Phase Indicators**:
  - `[REASON]` LLM thought processes.
  - `[TOOL]` External tool executions.
  - `[OBSERVE]` Inputs from the environment.
  - `[MEMORY]` State updates.
  - `[RETRY]` Explicit retry attempts.
- **Status Indicators**:
  - `OK` (Success)
  - `ERR` (Error)
  - `RETRY` (Retry attempt)
- **Run Status & Warnings**:
  - Displays the overall run status (e.g., `success`, `failure`, `stopped`).
  - **Truncation Warning**: prominently alerts if the run exceeded trace limits and is incomplete.
- **Deterministic Replay Guarantee**:
  - **No Re-execution**: The debugger never calls tools or LLMs. It reads strictly from persisted artifacts (`steps.jsonl`).
  - **Authoritative Ordering**: The step ID sequence in the timeline is the single source of truth for execution order.
  - **Read-Only**: Replay is side-effect free.

### 2. State Inspector
A detailed view of the agent's internal state at any specific step.
- **Recorded Data** (Immutable):
  - **Input**: The exact prompt or arguments passed.
  - **Output**: The exact response or return value.
  - **Memory Snapshot**: The recorded context window.
  - **Logs**: Raw stdout/stderr captures.
- **Derived Data** (Analysis):
  - **Metrics**: Token counts, duration (calculated).
- **Redaction**: Sensitive keys are masked (`********`) by the SDK before recording.

### 3. Diff Viewer
Compare state changes between steps.
- **Scope Restriction**: Diffs are strictly between recorded snapshots (Step N vs Step N+1).
- **Native Integration**: Uses VS Code's diff editor to highlight exact insertions/deletions in prompts or memory.

### 4. Run Comparison
Audit changes between two distinct execution runs.
- **Alignment Rule**: Runs are aligned by **Step Index** and **Phase**.
- **Immutability**: Comparison is read-only and does not modify or normalize the underlying artifacts.
- **Divergence**: Identifies the exact step index where inputs, outputs, or decisions diverged.

### 5. Diagnosis & Reports
Trace-grounded analysis of execution failures.
- **Evidence-Based**: All diagnosis claims reference specific Step IDs.
- **No Speculation**: The report distinguishes between **observed facts** (e.g., "Tool X failed 3 times") and **hypotheses**.

## Commands

Access these via the Command Palette (`Ctrl+Shift+P`):

| Command | Title | Description |
| :--- | :--- | :--- |
| `acp.openRun` | **ACP: Open Agent Run** | Load a `run_<id>` directory. Fails if artifacts are incomplete. |
| `acp.openFailure` | **ACP: Open at First Failure** | Jump to the first step marked with status `error`. |
| `acp.compareRun` | **ACP: Compare With Another Run** | Select a second run to compare against the loaded one. |
| `acp.generateReport` | **ACP: Generate Diagnosis Report** | Open a static HTML report of invariant violations. |
| `acp.counterfactual` | **ACP: Run Counterfactual Simulation** | **Create a new simulated run** branching from the current step. Original artifacts remain immutable. |

## Explicit Non-Goals

The ACP Extension is a control plane tool, not an agent framework. It explicitly **DOES NOT**:
- Execute agents or manage their runtime.
- Modify code or rewrite prompts.
- Auto-fix logic or retry loops.
- Hallucinate explanations for behavior.
- Apply changes to the agent's source code.

## Usage Guide

1.  **Generate a Trace**: Use the ACP Python SDK to record your agent's execution.
2.  **Open in VS Code**:
    - Run `ACP: Open Agent Run`.
    - Select the generated `traces/run_<uuid>` folder.
3.  **Navigate**: Use the **Timeline** panel to step through the authoritative sequence.
4.  **Inspect**: Verify inputs/outputs in the **State Inspector**.
5.  **Debug**: Use `ACP: Open at First Failure` to locate the root cause.

## Configuration

No configuration is required for basic replay. Advanced features (counterfactuals, deep analysis) may require specific SDK versions or optional engines.
