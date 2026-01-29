/**
 * Agent Control Plane - VS Code Extension
 * 
 * Provides visual inspection of agent traces within VS Code.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Types (duplicated from core to avoid dependency issues)
interface Trace {
    traceId: string;
    agentId: string;
    taskId: string;
    startTime: string;
    endTime?: string;
    status: string;
    steps: Step[];
    finalState?: unknown;
    metadata: {
        agentVersion: string;
        toolsUsed: string[];
        totalLLMCalls: number;
        totalToolCalls: number;
    };
}

interface Step {
    stepNumber: number;
    stepType: string;
    timestamp: string;
    input: unknown;
    output: unknown;
    stateSnapshot: unknown;
    duration?: number;
}

let currentTrace: Trace | undefined;
let tracePanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Agent Control Plane extension activated');

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('acp.openTrace', openTraceCommand),
        vscode.commands.registerCommand('acp.showPanel', showPanelCommand),
        vscode.commands.registerCommand('acp.analyzeTrace', analyzeTraceCommand),
        vscode.commands.registerCommand('acp.runDemo', runDemoCommand)
    );

    // Register tree data providers
    const tracesProvider = new TracesTreeProvider();
    const stepsProvider = new StepsTreeProvider();

    vscode.window.registerTreeDataProvider('acp.tracesView', tracesProvider);
    vscode.window.registerTreeDataProvider('acp.stepsView', stepsProvider);

    // Watch for trace file changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/traces/*.json');
    watcher.onDidCreate(() => tracesProvider.refresh());
    watcher.onDidChange(() => tracesProvider.refresh());
    watcher.onDidDelete(() => tracesProvider.refresh());
    context.subscriptions.push(watcher);
}

export function deactivate() {
    if (tracePanel) {
        tracePanel.dispose();
    }
}

/**
 * Open trace file command
 */
async function openTraceCommand(uri?: vscode.Uri) {
    let tracePath: string;

    if (uri) {
        tracePath = uri.fsPath;
    } else {
        const files = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: { 'JSON files': ['json'] },
            title: 'Select Trace File',
        });

        if (!files || files.length === 0) {
            return;
        }

        tracePath = files[0].fsPath;
    }

    try {
        const content = fs.readFileSync(tracePath, 'utf-8');
        currentTrace = JSON.parse(content) as Trace;

        // Refresh steps view
        vscode.commands.executeCommand('acp.stepsView.focus');

        // Show panel
        showTracePanel(currentTrace);

        vscode.window.showInformationMessage(`Loaded trace: ${currentTrace.traceId}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to load trace: ${error}`);
    }
}

/**
 * Show trace inspector panel
 */
async function showPanelCommand() {
    if (!currentTrace) {
        const result = await vscode.window.showWarningMessage(
            'No trace loaded. Would you like to open one?',
            'Open Trace'
        );

        if (result === 'Open Trace') {
            await openTraceCommand();
        }
        return;
    }

    showTracePanel(currentTrace);
}

/**
 * Analyze current trace
 */
async function analyzeTraceCommand() {
    if (!currentTrace) {
        vscode.window.showWarningMessage('No trace loaded');
        return;
    }

    // Basic analysis
    const warnings: string[] = [];

    if (currentTrace.steps.length > 10) {
        warnings.push(`High step count: ${currentTrace.steps.length}`);
    }

    const toolCalls = currentTrace.steps.filter(s => s.stepType === 'tool');
    const toolCallsByName = new Map<string, number>();

    for (const step of toolCalls) {
        const input = step.input as { toolName: string };
        const count = toolCallsByName.get(input.toolName) || 0;
        toolCallsByName.set(input.toolName, count + 1);
    }

    for (const [tool, count] of toolCallsByName) {
        if (count >= 3) {
            warnings.push(`Repeated tool calls: ${tool} called ${count} times`);
        }
    }

    const errors = currentTrace.steps.filter(s => s.stepType === 'error');
    if (errors.length > 0) {
        warnings.push(`Errors: ${errors.length} error(s) detected`);
    }

    // Show results
    const message = warnings.length > 0
        ? `Analysis found ${warnings.length} issue(s):\n${warnings.join('\n')}`
        : 'No issues found!';

    vscode.window.showInformationMessage(message);
}

/**
 * Run demo agent
 */
async function runDemoCommand() {
    const terminal = vscode.window.createTerminal('ACP Demo');
    terminal.show();
    terminal.sendText('npm run demo');
}

/**
 * Show trace in webview panel
 */
function showTracePanel(trace: Trace) {
    if (tracePanel) {
        tracePanel.reveal();
    } else {
        tracePanel = vscode.window.createWebviewPanel(
            'acpTrace',
            `Trace: ${trace.traceId}`,
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        tracePanel.onDidDispose(() => {
            tracePanel = undefined;
        });
    }

    tracePanel.webview.html = getWebviewContent(trace);
}

/**
 * Generate webview HTML
 */
function getWebviewContent(trace: Trace): string {
    const stepsHtml = trace.steps.map(step => `
    <div class="step ${step.stepType}" onclick="showStep(${step.stepNumber})">
      <div class="step-header">
        <span class="step-num">${step.stepNumber}</span>
        <span class="step-type">${step.stepType.toUpperCase()}</span>
        <span class="step-time">${step.duration || 0}ms</span>
      </div>
      <div class="step-summary">${getStepSummary(step)}</div>
    </div>
  `).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: var(--vscode-font-family);
          padding: 20px;
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
        }
        .header {
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header h1 {
          margin: 0 0 10px 0;
          font-size: 18px;
        }
        .meta {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
        }
        .meta-item {
          display: flex;
          flex-direction: column;
        }
        .meta-label {
          font-weight: bold;
          margin-bottom: 2px;
        }
        .steps-container {
          display: flex;
          gap: 20px;
        }
        .steps-list {
          flex: 1;
          max-width: 300px;
        }
        .step-detail {
          flex: 2;
          background: var(--vscode-editor-inactiveSelectionBackground);
          padding: 15px;
          border-radius: 4px;
          display: none;
        }
        .step-detail.active {
          display: block;
        }
        .step {
          padding: 10px;
          margin-bottom: 5px;
          border-radius: 4px;
          cursor: pointer;
          background: var(--vscode-list-hoverBackground);
        }
        .step:hover {
          background: var(--vscode-list-activeSelectionBackground);
        }
        .step.selected {
          background: var(--vscode-list-activeSelectionBackground);
          border-left: 3px solid var(--vscode-focusBorder);
        }
        .step-header {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 5px;
        }
        .step-num {
          font-weight: bold;
          color: var(--vscode-textLink-foreground);
        }
        .step-type {
          background: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
        }
        .step.llm .step-type { background: #4CAF50; }
        .step.tool .step-type { background: #2196F3; }
        .step.error .step-type { background: #f44336; }
        .step.decision .step-type { background: #FF9800; }
        .step-time {
          font-size: 10px;
          color: var(--vscode-descriptionForeground);
          margin-left: auto;
        }
        .step-summary {
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        pre {
          background: var(--vscode-textBlockQuote-background);
          padding: 10px;
          border-radius: 4px;
          overflow-x: auto;
          font-size: 12px;
        }
        h3 {
          margin-top: 15px;
          margin-bottom: 5px;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🔍 Trace Inspector</h1>
        <div class="meta">
          <div class="meta-item">
            <span class="meta-label">Trace ID</span>
            <span>${trace.traceId}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Status</span>
            <span>${trace.status}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Steps</span>
            <span>${trace.steps.length}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">LLM Calls</span>
            <span>${trace.metadata.totalLLMCalls}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Tool Calls</span>
            <span>${trace.metadata.totalToolCalls}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Tools Used</span>
            <span>${trace.metadata.toolsUsed.join(', ') || 'None'}</span>
          </div>
        </div>
      </div>
      
      <div class="steps-container">
        <div class="steps-list">
          <h2>Steps</h2>
          ${stepsHtml}
        </div>
        <div class="step-detail" id="stepDetail">
          <p>Click a step to see details</p>
        </div>
      </div>

      <script>
        const trace = ${JSON.stringify(trace)};
        
        function showStep(stepNum) {
          const step = trace.steps.find(s => s.stepNumber === stepNum);
          if (!step) return;
          
          // Update selection
          document.querySelectorAll('.step').forEach(el => el.classList.remove('selected'));
          document.querySelector('.step:nth-child(' + stepNum + ')').classList.add('selected');
          
          // Show detail
          const detail = document.getElementById('stepDetail');
          detail.classList.add('active');
          detail.innerHTML = \`
            <h2>Step \${step.stepNumber} - \${step.stepType.toUpperCase()}</h2>
            <p><strong>Timestamp:</strong> \${step.timestamp}</p>
            <p><strong>Duration:</strong> \${step.duration || 0}ms</p>
            
            <h3>Input</h3>
            <pre>\${JSON.stringify(step.input, null, 2)}</pre>
            
            <h3>Output</h3>
            <pre>\${JSON.stringify(step.output, null, 2)}</pre>
            
            <h3>State Snapshot</h3>
            <pre>\${JSON.stringify(step.stateSnapshot, null, 2)}</pre>
          \`;
        }
        
        // Auto-select first step
        if (trace.steps.length > 0) {
          showStep(1);
        }
      </script>
    </body>
    </html>
  `;
}

/**
 * Get step summary for display
 */
function getStepSummary(step: Step): string {
    switch (step.stepType) {
        case 'llm':
            const llmOutput = step.output as { response: string };
            return llmOutput.response?.substring(0, 50) + '...' || 'LLM response';
        case 'tool':
            const toolInput = step.input as { toolName: string };
            const toolOutput = step.output as { success: boolean };
            return `${toolInput.toolName} ${toolOutput.success ? '✓' : '✗'}`;
        case 'error':
            const errorOutput = step.output as { error: string };
            return errorOutput.error?.substring(0, 40) + '...' || 'Error';
        case 'start':
            return 'Agent started';
        case 'end':
            return 'Agent ended';
        default:
            return step.stepType;
    }
}

/**
 * Tree data provider for traces
 */
class TracesTreeProvider implements vscode.TreeDataProvider<TraceItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TraceItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TraceItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<TraceItem[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }

        const tracesDir = path.join(workspaceFolders[0].uri.fsPath, 'traces');

        if (!fs.existsSync(tracesDir)) {
            return [];
        }

        const files = fs.readdirSync(tracesDir)
            .filter(f => f.endsWith('.json'))
            .slice(-10); // Show last 10 traces

        return files.map(file => {
            const filePath = path.join(tracesDir, file);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const trace = JSON.parse(content) as Trace;
                return new TraceItem(
                    trace.traceId,
                    trace.status,
                    filePath,
                    vscode.TreeItemCollapsibleState.None
                );
            } catch {
                return new TraceItem(file, 'error', filePath, vscode.TreeItemCollapsibleState.None);
            }
        });
    }
}

class TraceItem extends vscode.TreeItem {
    constructor(
        public readonly traceId: string,
        public readonly status: string,
        public readonly filePath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(traceId.replace('trace_', ''), collapsibleState);
        this.tooltip = `${traceId}\nStatus: ${status}`;
        this.description = status;
        this.iconPath = status === 'completed'
            ? new vscode.ThemeIcon('pass')
            : new vscode.ThemeIcon('error');
        this.command = {
            command: 'acp.openTrace',
            title: 'Open Trace',
            arguments: [vscode.Uri.file(filePath)],
        };
    }
}

/**
 * Tree data provider for steps
 */
class StepsTreeProvider implements vscode.TreeDataProvider<StepItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<StepItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: StepItem): vscode.TreeItem {
        return element;
    }

    getChildren(): StepItem[] {
        if (!currentTrace) {
            return [];
        }

        return currentTrace.steps.map(step => new StepItem(step));
    }
}

class StepItem extends vscode.TreeItem {
    constructor(public readonly step: Step) {
        super(`Step ${step.stepNumber}`, vscode.TreeItemCollapsibleState.None);
        this.description = step.stepType.toUpperCase();
        this.tooltip = `${step.stepType}\n${step.timestamp}`;

        const icons: Record<string, string> = {
            'llm': 'comment',
            'tool': 'tools',
            'error': 'error',
            'start': 'debug-start',
            'end': 'debug-stop',
            'decision': 'git-compare',
            'state': 'database',
        };

        this.iconPath = new vscode.ThemeIcon(icons[step.stepType] || 'circle-outline');
    }
}
