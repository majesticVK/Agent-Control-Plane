# Agent Control Plane - Complete Demo Guide

This guide demonstrates all functionality of the Agent Control Plane MVP.

## Prerequisites

```powershell
cd D:\Agent-Control-Plane
npm install
cd vscode-extension
npm install
cd ..
```

## Demo Flow

### 1. Run the Agent (Generate a Trace)

```powershell
npm start
```

**What this does:**
- Executes restaurant booking agent
- Agent calls LLM 4 times, uses 3 tools
- Generates deterministic trace in `traces/` folder
- Shows execution summary with trace file path

**Expected Output:**
```
Success: Yes
Steps: 9
LLM Calls: 4
Tool Calls: 3
Tools Used: search_restaurants, check_availability, book_restaurant
Status: completed
Trace saved: traces\trace_<timestamp>_<id>.json
```

### 2. Replay the Trace (Prove Determinism)

```powershell
npm run replay traces\trace_<timestamp>_<id>.json
```

**What this does:**
- Loads the original trace
- Re-runs agent with exact same inputs
- Compares every step and final state
- Reports if execution is deterministic

**Expected Output:**
```
Original Steps: 9
Replay Steps:   9
Steps Match:    Yes
State Match:    Yes
✓ No divergences - replay is deterministic!
```

### 3. Inspect Trace (CLI)

```powershell
npm run inspect traces\trace_<timestamp>_<id>.json
```

**What this does:**
- Loads trace and displays detailed breakdown
- Shows each step with type, duration, input/output
- Displays metadata and execution flow

**Expected Output:**
```
Step 1: START (0ms)
Step 2: LLM (245ms)
  Input: "Find Italian restaurants..."
  Output: "I'll search for Italian restaurants"
...
Step 9: END (0ms)

Total Duration: 1,234ms
LLM Calls: 4
Tool Calls: 3
```

### 4. Run Behavioral Tests

```powershell
npm run test
```

**What this does:**
- Runs all test cases from `tests/` folder
- Each test defines expected agent behavior
- Validates LLM patterns, tool calls, outcomes

**Expected Output:**
```
Running tests from: tests\restaurant-booking.test.yaml

Test: should successfully book a restaurant
  ✓ Status: completed
  ✓ LLM calls >= 3
  ✓ Used tool: search_restaurants
  ✓ Used tool: check_availability
  ✓ Used tool: book_restaurant
  ✓ Final state contains: confirmed

✓ All tests passed!
```

### 5. Analyze Traces

```powershell
npm run analyze traces\trace_<timestamp>_<id>.json
```

**What this does:**
- Performs automated analysis
- Detects patterns, inefficiencies, errors
- Suggests optimizations

**Expected Output:**
```
Analyzing: traces\trace_<timestamp>_<id>.json

Performance:
  Total Duration: 1,234ms
  LLM Latency: 245ms avg
  Tool Latency: 156ms avg

Tool Usage:
  search_restaurants: 1 call
  check_availability: 1 call
  book_restaurant: 1 call

Quality:
  ✓ No repeated tool calls
  ✓ No errors
  ✓ Efficient execution path
```

### 6. VS Code Extension Demo

#### Launch Extension

From the main workspace:
```powershell
# Press F5 in VS Code
# Or from command line:
code .
# Then press F5
```

#### Extension Features

**A. Traces View**
1. Click "Agent Control Plane" icon in Activity Bar
2. See list of all traces with status icons
3. Click any trace to open inspector

**B. Trace Inspector Panel**
- Shows trace metadata (ID, status, steps, LLM/tool calls)
- Interactive step list with color-coded badges
- Click any step to see full input/output/state

**C. Steps View**
- Sidebar showing steps of current trace
- Icons for each step type (LLM, tool, error)
- Quick navigation through execution

**D. Commands** (Ctrl+Shift+P)
- `ACP: Open Trace File` - Load trace
- `ACP: Show Trace Inspector` - Open panel
- `ACP: Analyze Current Trace` - Run analysis
- `ACP: Run Agent` - Execute agent in terminal

**E. Analysis**
1. Open a trace
2. Run `ACP: Analyze Current Trace`
3. See warnings:
   - High step count
   - Repeated tool calls
   - Errors detected

## Complete Demo Script

Run these commands in sequence to demonstrate everything:

```powershell
# 1. Generate trace
npm start

# 2. Replay it (copy the trace path from step 1)
npm run replay traces\trace_1769726549771_nuv22w4cj.json

# 3. Inspect details
npm run inspect traces\trace_1769726549771_nuv22w4cj.json

# 4. Run tests
npm run test

# 5. Analyze
npm run analyze traces\trace_1769726549771_nuv22w4cj.json

# 6. Launch VS Code extension
# Press F5 in VS Code and demonstrate UI
```

## Key Points to Highlight

### ✓ Deterministic Recording
- Every agent execution is captured as JSON trace
- Includes all LLM calls, tool invocations, state changes
- Timestamped and uniquely identified

### ✓ Perfect Replay
- Traces can be replayed exactly
- No divergence between original and replay
- Proves determinism

### ✓ Visual Inspection
- VS Code extension provides rich UI
- Step-by-step execution visualization
- Input/output/state for each step

### ✓ Behavioral Testing
- YAML-based test definitions
- Assert on agent behavior patterns
- Automated validation

### ✓ Analysis & Debugging
- Detect inefficiencies automatically
- Find repeated calls, errors, bottlenecks
- Performance metrics

## Architecture Overview

```
Agent Runtime → Trace Recorder → JSON Trace
                                     ↓
                     ┌───────────────┴────────────────┐
                     ↓                                 ↓
              Replay Engine                    VS Code Extension
                     ↓                                 ↓
         Verify Determinism                    Visual Inspector
```

## Production Ready

- No "demo" or "mock" code
- Real trace format
- Working CLI tools
- Functional VS Code extension
- Automated testing
- Complete documentation

---

**Agent Control Plane MVP - Proving agent behavior is observable, replayable, and testable.**
