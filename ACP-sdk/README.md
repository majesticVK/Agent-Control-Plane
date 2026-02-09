# Agent Control Plane (ACP) Python SDK

The **ACP Python SDK** is a control-plane instrumentation layer for AI agents. It deterministically records agent execution into a strictly ordered, replayable trace format without modifying the agent's behavior.

## Installation

```bash
pip install acp-sdk
```

*(Note: Currently in development, install from source)*

## Core Concepts

The SDK revolves around recording **Steps** at defined **Execution Boundaries**.

- **Run**: A single execution session of an agent.
- **Step**: An atomic unit of execution (Reasoning, Tool Call, Observation).
- **Snapshot**: A point-in-time capture of the agent's memory and state.
- **Artifacts**: The persistent files generated (`meta.json`, `steps.jsonl`, `snapshots/`).

## Industrial-Grade Features

### 1. Robust Retry Handling
The SDK provides first-class support for capturing retry loops and flaky tool calls.
- **`@tool(retry_policy=N)`**: Automatically instruments retries, recording `[RETRY]` phase steps for failed attempts and preserving intermediate error logs.
- **`@retry_block`**: Wraps arbitrary logic blocks to capture retries explicitly.
- **IO Isolation**: Ensures that logs (stdout/stderr) from failed attempts do not pollute the final success step or other concurrent steps.

### 2. Strict Mode
For CI/CD and production environments, `TraceRecorder` can be configured in **Strict Mode**.
- Raises `RuntimeError` if steps are recorded without an active run.
- Prevents silent failures or data loss due to misconfiguration.
- Enforces correct lifecycle management (Start -> Record -> Stop).

### 3. Mutable Step Context
The `step` context manager yields a mutable `StepContext` object, allowing you to dynamically update outputs or status *during* execution.

```python
with acp.step("reason") as ctx:
    # ... logic ...
    ctx.set_output("thought", "I should search for X")
    if error_condition:
        ctx.set_status("failure")
```

## Deterministic Replay Contract

The SDK enforces a strict contract to guarantee that traces can be replayed deterministically without re-executing the agent's logic.

1.  **No Side Effects on Replay**: Tool outputs and LLM responses are persisted. During replay, the system reads from artifacts, never calling external APIs.
2.  **Captured Environment**: Random seeds, time, and external inputs are frozen at recording time.
3.  **Authoritative Ordering**: The `steps.jsonl` file is the single source of truth for the sequence of events.

## Safety & Limits

### Redaction
By default, the SDK automatically redacts sensitive patterns (API keys, JWTs) from:
- Tool inputs/outputs
- Prompts/Responses
- Memory snapshots

### Trace Limits
To prevent runaway agents from exhausting resources, the SDK enforces:
- **Max Steps**: 1000 steps per run (default).
- **Truncation**: Runs exceeding limits are cleanly stopped and marked as `truncated`.

## Explicit Non-Goals

The ACP SDK is a **passive observer**. It explicitly **DOES NOT**:
- Modify prompts or inject system instructions.
- Redesign or optimize agent logic.
- Auto-fix errors or retry loops.
- Simulate counterfactuals (that is the job of the Analysis Engine).
- Generate explanations or summaries.

## API Reference

### 1. Initialization

#### `acp.init(agent_version, llm, seed, tools)`
Starts a new recording session. Enforces a single active run per process.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `agent_version` | `str` | Identifier for your agent (e.g., "v1.0.0"). |
| `llm` | `str` | Identifier for the model used (e.g., "gpt-4"). |
| `seed` | `int` | Random seed for reproducibility. |
| `tools` | `list[str]` | List of enabled tool names. |

**Example:**
```python
import acp
acp.init(agent_version="v1", llm="gpt-4", tools=["search", "calc"])
```

---

### 2. Instrumentation Decorators

#### `@acp.tool(name=None, retry_policy=0)`
Wraps a tool function to record its inputs, outputs, and execution status.

- **Automatic Capture**: Arguments (`args`, `kwargs`), Return Value, Exceptions.
- **Retry Logic**: If `retry_policy > 0`, handles up to N retries, recording intermediate failures as `retry` steps.
- **Side Effects**: Records a `tool` phase step.

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `name` | `str` | `func.__name__` | Custom name for the tool in the trace. |
| `retry_policy` | `int` | `0` | Number of retries allowed (0 = none). |

**Example:**
```python
@acp.tool(name="web_search", retry_policy=2)
def search(query: str):
    return "Results..."
```

#### `@acp.llm_wrapper`
Wraps a function that calls an LLM to record the prompt and response.

- **Side Effects**: Records a `reason` phase step.

**Example:**
```python
@acp.llm_wrapper
def call_gpt(prompt):
    return openai.ChatCompletion.create(...)
```

---

### 3. Manual Context Managers

#### `with acp.step(phase, input_data=None) as ctx`
Manually defines an execution boundary. Yields a `StepContext` for dynamic updates.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `phase` | `str` | The phase type (`reason`, `observe`, `act`, `memory`, `retry`, `terminate`). |
| `input_data` | `dict` | (Optional) Metadata/inputs for this step. |

**Example:**
```python
with acp.step("observe", {"source": "user"}) as ctx:
    user_input = get_user_input()
    ctx.set_output("content", user_input)
```

---

### 4. State Management

#### `acp.update_memory(memory_state)`
Updates the current memory snapshot. This snapshot is attached to subsequent steps.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `memory_state` | `Any` | The full memory object (list, dict, string) to serialize. |

**Example:**
```python
memory = [{"role": "user", "content": "Hi"}]
acp.update_memory(memory)
```

---

### 5. Termination

#### `acp.stop(reason="success")`
Cleanly stops the recording session and flushes any remaining data.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `reason` | `str` | Termination reason (`success`, `failure`, `limit_exceeded`, etc.). |

---

## Artifact Structure

The SDK generates a `run_<uuid>` directory containing:

1.  **`meta.json`**: Run configuration, status, termination reason, and limits.
2.  **`steps.jsonl`**: Newline-delimited JSON stream of every step.
3.  **`snapshots/`**: JSON files containing full state snapshots (referenced by steps).
4.  **`tools/`**: Raw stdout/stderr logs for tool calls.

## Usage Example

```python
import acp

# 1. Start Run
acp.init(agent_version="demo", llm="gpt-4")

# 2. Instrument Tool with Retries
@acp.tool(retry_policy=2)
def get_weather(city):
    # Simulate flake
    if random.random() < 0.5: raise ValueError("Network Error")
    return "Sunny"

# 3. Execution Loop
try:
    with acp.step("reason") as ctx:
        thought = "User wants weather"
        ctx.set_output("thought", thought)
    
    result = get_weather("NYC")
    
    with acp.step("observe"):
        acp.update_memory([{"role": "tool", "content": result}])

finally:
    acp.stop()
```
