# How to Run "Agent Control Plane" (ACP) Extension

This guide will help you run and test the **Agent Control Plane** VS Code extension.

## Prerequisites

- **Node.js** (v16+)
- **VS Code** (latest version)
- **Git**

## Setup

1.  **Open the Extension Folder**:
    Open the `vscode-extension` directory in VS Code:
    ```powershell
    code d:\Agent-Control-Plane\vscode-extension
    ```

2.  **Install Dependencies**:
    Open the integrated terminal in VS Code (`Ctrl + ` `) and run:
    ```powershell
    npm install
    ```
    *(Note: The project has no runtime dependencies, only dev dependencies like `typescript` and `@types/vscode`).*

3.  **Compile the Code**:
    Run the compile script to build the extension:
    ```powershell
    npm run compile
    ```

## Running the Extension

1.  **Launch Debugging**:
    - Press **F5** (or go to **Run and Debug** > **Run Extension**).
    - This will open a new **Extension Development Host** window.

2.  **Verify Activation**:
    - In the new window, look at the **Activity Bar** (left side).
    - You should see the **Agent Control Plane** icon (likely a default icon if `resources/icon.svg` is missing, or the configured one).

## Using the Extension

### 1. Open a Trace
- Press **F1** (or `Ctrl+Shift+P`) to open the Command Palette.
- Type **ACP: Open Agent Run**.
- Select the `traces/run_mock_uuid` directory (or any valid `run_<id>` folder).
- **Note**: You must select the *directory*, not a specific file.

### 2. Inspect the Timeline
- The **Timeline** panel will populate with steps.
- Click on any step to inspect it.
- **Color Codes**:
  - Green: Reasoning
  - Blue: Tool Calls
  - Purple: Observations
  - Orange: Memory
- **Status Icons**:
  - 🔴 Error
  - ⚠️ Retry
  - ✓ Success

### 3. Inspect State
- Open the **State Inspector** panel.
- As you click steps in the Timeline, this panel updates to show:
  - Input/Prompt
  - Output/Response
  - Memory Snapshot (redacted)
  - Tool Logs (stdout/stderr)

### 4. View Diffs
- Open the **Diff Viewer** panel.
- Click **Diff Input/Prompt** or **Diff Memory**.
- A VS Code diff editor will open, comparing the current step with the previous one.

### 5. Diagnosis & Analysis
- Run **ACP: Generate Diagnosis Report** from the Command Palette.
- A report will open showing invariant violations and root cause analysis.

### 6. Counterfactuals
- Run **ACP: Run Counterfactual Simulation**.
- Enter a Step ID (e.g., `1`).
- Enter a JSON modification (e.g., `{"input": {"prompt": "New prompt"}}`).
- A new simulation run will be created in the `traces` folder.

## Troubleshooting

- **"Command not found"**: Ensure the extension activated successfully. Check the "Debug Console" in the original VS Code window.
- **"No run loaded"**: You must run **ACP: Open Agent Run** first.
- **"SyntaxError in Diff"**: This has been fixed in the latest build. Ensure you ran `npm run compile`.

## Key Commands

| Command | Description |
| :--- | :--- |
| `acp.openRun` | Open a run directory |
| `acp.openFailure` | Jump to the first error |
| `acp.generateReport` | View analysis report |
| `acp.counterfactual` | Create a simulation branch |
