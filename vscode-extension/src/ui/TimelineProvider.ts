import * as vscode from 'vscode';
import { RunContext } from '../data/RunContext';
import { AgentStep } from '../data/DataTypes';

export class TimelineProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'acp.timelinePanel';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {
        // Listen for run changes
        RunContext.getInstance().onDidRunChange(run => {
            if (this._view && run) {
                this._view.webview.postMessage({ type: 'loadRun', steps: run.steps, meta: run.meta });
            }
        });

        // Listen for step changes
        RunContext.getInstance().onDidStepChange(step => {
            if (this._view) {
                this._view.webview.postMessage({ type: 'selectStep', stepId: step.step_id });
            }
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'jumpToStep':
                    this.jumpToStepId(data.stepId);
                    break;
                case 'nextStep':
                    this.navigateStep(1);
                    break;
                case 'prevStep':
                    this.navigateStep(-1);
                    break;
            }
        });

        // Initial load if run exists
        const currentRun = RunContext.getInstance().currentRun;
        if (currentRun) {
            webviewView.webview.postMessage({ type: 'loadRun', steps: currentRun.steps, meta: currentRun.meta });
        }
    }

    private jumpToStepId(stepId: number) {
        const run = RunContext.getInstance().currentRun;
        if (run) {
            const index = run.steps.findIndex(s => s.step_id === stepId);
            if (index !== -1) {
                RunContext.getInstance().setStep(index);
            }
        }
    }

    private navigateStep(delta: number) {
        const run = RunContext.getInstance().currentRun;
        const currentStep = RunContext.getInstance().currentStep;
        
        if (run && currentStep) {
            const currentIndex = run.steps.findIndex(s => s.step_id === currentStep.step_id);
            if (currentIndex !== -1) {
                const newIndex = currentIndex + delta;
                if (newIndex >= 0 && newIndex < run.steps.length) {
                    RunContext.getInstance().setStep(newIndex);
                }
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const nonce = getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Agent Timeline</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 0; margin: 0; display: flex; flex-direction: column; height: 100vh; }
                
                .controls {
                    display: flex;
                    gap: 10px;
                    padding: 8px;
                    background: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }

                .warning-banner {
                    background-color: var(--vscode-inputValidation-warningBackground);
                    border-bottom: 1px solid var(--vscode-inputValidation-warningBorder);
                    color: var(--vscode-foreground);
                    padding: 8px;
                    font-size: 12px;
                    display: none;
                }

                .run-status {
                    padding: 4px 8px;
                    font-size: 11px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background: var(--vscode-sideBar-background);
                }
                
                button {
                    flex: 1;
                    padding: 4px 8px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                    border-radius: 2px;
                }
                
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }

                .step-list { 
                    flex: 1; 
                    overflow-y: auto; 
                }
                
                .step { 
                    padding: 8px 12px; 
                    border-bottom: 1px solid var(--vscode-panel-border); 
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .step:hover { background: var(--vscode-list-hoverBackground); }
                .step.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
                .step-id { font-family: var(--vscode-editor-font-family); font-size: 11px; opacity: 0.7; min-width: 24px; }
                .step-phase { 
                    font-size: 10px; 
                    text-transform: uppercase; 
                    padding: 2px 6px; 
                    border-radius: 4px; 
                    font-weight: bold;
                    min-width: 60px;
                    text-align: center;
                }
                .phase-reason { background: #4CAF50; color: white; }
                .phase-tool { background: #2196F3; color: white; }
                .phase-observe { background: #9C27B0; color: white; }
                .phase-memory { background: #FF9800; color: white; }
                .phase-retry { background: #FF9800; color: black; border: 1px solid #E65100; }
                
                .step-status { font-size: 16px; font-weight: bold; font-family: var(--vscode-font-family); }
                .status-ok { color: var(--vscode-testing-iconPassed); }
                .status-error { color: var(--vscode-testing-iconFailed); }
                .status-retry { color: var(--vscode-charts-yellow); }

                .step-content { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
            </style>
        </head>
        <body>
            <div id="truncation-warning" class="warning-banner">
                ⚠️ Run Truncated (Max Steps Exceeded)
            </div>
            <div id="run-info" class="run-status"></div>
            <div class="controls">
                <button onclick="vscode.postMessage({type: 'prevStep'})">Previous</button>
                <button onclick="vscode.postMessage({type: 'nextStep'})">Next</button>
            </div>
            <div id="timeline" class="step-list"></div>
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                const timeline = document.getElementById('timeline');
                const runInfo = document.getElementById('run-info');
                const warningBanner = document.getElementById('truncation-warning');
                let steps = [];
                let meta = null;

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'loadRun':
                            steps = message.steps;
                            meta = message.meta;
                            render();
                            break;
                        case 'selectStep':
                            selectStep(message.stepId);
                            break;
                    }
                });

                // Add keyboard navigation
                window.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowUp') {
                        vscode.postMessage({type: 'prevStep'});
                        e.preventDefault();
                    } else if (e.key === 'ArrowDown') {
                        vscode.postMessage({type: 'nextStep'});
                        e.preventDefault();
                    }
                });

                function render() {
                    if (meta) {
                         let statusText = \`Status: \${meta.status}\`;
                         if (meta.termination_reason) {
                             statusText += \` (\${meta.termination_reason})\`;
                         }
                         runInfo.textContent = statusText;

                         if (meta.truncated) {
                             warningBanner.style.display = 'block';
                         } else {
                             warningBanner.style.display = 'none';
                         }
                    }

                    timeline.innerHTML = steps.map(step => {
                        let content = '';
                        if (step.phase === 'tool') {
                            content = step.input.toolName || 'Tool Call';
                        } else if (step.phase === 'reason') {
                            content = 'Reasoning...';
                        } else if (step.phase === 'retry') {
                             content = \`Retry Attempt \${step.input.attempt || '?'}\`;
                        } else {
                            content = step.phase;
                        }

                        const statusIcon = step.status === 'error' ? 'ERR' : step.status === 'retry' ? 'RETRY' : 'OK';
                        const statusClass = 'status-' + step.status;

                        return \`
                            <div class="step" id="step-\${step.step_id}" onclick="vscode.postMessage({type: 'jumpToStep', stepId: \${step.step_id}})">
                                <span class="step-id">#\${step.step_id}</span>
                                <span class="step-phase phase-\${step.phase}">\${step.phase}</span>
                                <span class="step-status \${statusClass}">\${statusIcon}</span>
                                <span class="step-content">\${content}</span>
                            </div>
                        \`;
                    }).join('');
                }

                function selectStep(id) {
                    document.querySelectorAll('.step').forEach(el => el.classList.remove('selected'));
                    const el = document.getElementById('step-' + id);
                    if (el) {
                        el.classList.add('selected');
                        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }
                }
            </script>
        </body>
        </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
