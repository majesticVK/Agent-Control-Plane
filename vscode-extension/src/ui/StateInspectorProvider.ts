import * as vscode from 'vscode';
import { RunContext } from '../data/RunContext';
import { SecretRedactor } from '../utils/SecretRedactor';

export class StateInspectorProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'acp.stateInspector';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {
        RunContext.getInstance().onDidStepChange(step => {
            if (this._view) {
                this.updateContent(step.step_id);
            }
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtmlForWebview();
        
        const currentStep = RunContext.getInstance().currentStep;
        if (currentStep) {
            this.updateContent(currentStep.step_id);
        }
    }

    private updateContent(stepId: number) {
        const loader = RunContext.getInstance().loader;
        const step = RunContext.getInstance().currentRun?.steps.find(s => s.step_id === stepId);
        
        if (!loader || !step) return;

        const snapshot = loader.getSnapshot(stepId);
        let toolOutput = null;
        if (step.phase === 'tool' || step.phase === 'observe') {
             toolOutput = {
                 stdout: loader.getToolOutput(stepId, 'stdout'),
                 stderr: loader.getToolOutput(stepId, 'stderr')
             };
        }

        // Redact everything before sending
        const redactedStep = SecretRedactor.redactObject(step);
        const redactedSnapshot = SecretRedactor.redactObject(snapshot);
        const redactedToolOutput = SecretRedactor.redactObject(toolOutput);

        this._view?.webview.postMessage({
            type: 'update',
            step: redactedStep,
            snapshot: redactedSnapshot,
            toolOutput: redactedToolOutput
        });
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <style>
                body { font-family: var(--vscode-font-family); padding: 10px; }
                h3 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; margin-top: 20px; }
                pre { background: var(--vscode-textCodeBlock-background); padding: 10px; overflow: auto; max-height: 200px; }
                .metric { display: inline-block; margin-right: 15px; font-size: 12px; color: var(--vscode-descriptionForeground); }
                .value { font-weight: bold; color: var(--vscode-foreground); }
            </style>
        </head>
        <body>
            <div id="metrics"></div>
            
            <h3>Step Input</h3>
            <pre id="input">No data</pre>

            <h3>Step Output</h3>
            <pre id="output">No data</pre>

            <h3>Memory Snapshot</h3>
            <pre id="memory">No snapshot loaded</pre>

            <h3>Tool Logs</h3>
            <pre id="logs">No logs</pre>

            <script>
                const vscode = acquireVsCodeApi();
                window.addEventListener('message', event => {
                    const { step, snapshot, toolOutput } = event.data;
                    
                    document.getElementById('input').textContent = JSON.stringify(step.input, null, 2);
                    document.getElementById('output').textContent = JSON.stringify(step.output, null, 2);
                    
                    if (snapshot) {
                        document.getElementById('memory').textContent = JSON.stringify(snapshot.memory, null, 2);
                        
                        const metricsHtml = \`
                            <span class="metric">Context: <span class="value">\${snapshot.context_tokens || 0}</span> tok</span>
                            <span class="metric">Memory: <span class="value">\${(snapshot.memory || []).length}</span> entries</span>
                        \`;
                        document.getElementById('metrics').innerHTML = metricsHtml;
                    } else {
                         document.getElementById('memory').textContent = "Snapshot not available (lazy loaded)";
                         document.getElementById('metrics').innerHTML = "";
                    }

                    if (toolOutput && (toolOutput.stdout || toolOutput.stderr)) {
                        let logs = '';
                        if (toolOutput.stdout) logs += 'STDOUT:\\n' + toolOutput.stdout + '\\n';
                        if (toolOutput.stderr) logs += 'STDERR:\\n' + toolOutput.stderr;
                        document.getElementById('logs').textContent = logs;
                    } else {
                        document.getElementById('logs').textContent = "No tool logs";
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
