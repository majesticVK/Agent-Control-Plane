import * as vscode from 'vscode';
import { RunContext } from '../data/RunContext';
import { DiffContentProvider } from '../providers/DiffContentProvider';

export class DiffViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'acp.diffViewer';
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
        
        webviewView.webview.onDidReceiveMessage(message => {
            if (message.command === 'openDiff') {
                const stepId = message.stepId;
                const type = message.type;
                const uri1 = vscode.Uri.parse(`${DiffContentProvider.scheme}:prev_${type}.json?stepId=${stepId-1}&type=${type}`);
                const uri2 = vscode.Uri.parse(`${DiffContentProvider.scheme}:curr_${type}.json?stepId=${stepId}&type=${type}`);
                
                vscode.commands.executeCommand('vscode.diff', uri1, uri2, `Step ${stepId-1} ↔ ${stepId} (${type})`);
            }
        });

        const currentStep = RunContext.getInstance().currentStep;
        if (currentStep) {
            this.updateContent(currentStep.step_id);
        }
    }

    private updateContent(stepId: number) {
        this._view?.webview.postMessage({ type: 'update', stepId });
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <style>
                body { font-family: var(--vscode-font-family); padding: 10px; }
                button { 
                    width: 100%; 
                    margin-bottom: 10px; 
                    padding: 8px; 
                    background: var(--vscode-button-background); 
                    color: var(--vscode-button-foreground); 
                    border: none; 
                    cursor: pointer; 
                }
                button:hover { background: var(--vscode-button-hoverBackground); }
            </style>
        </head>
        <body>
            <h3>Diff Options</h3>
            <p>Compare Step <span id="stepId">-</span> with previous:</p>
            <button onclick="openDiff('prompt')">Diff Input/Prompt</button>
            <button onclick="openDiff('memory')">Diff Memory</button>

            <script>
                const vscode = acquireVsCodeApi();
                let currentStepId = 0;

                window.addEventListener('message', event => {
                    currentStepId = event.data.stepId;
                    document.getElementById('stepId').textContent = currentStepId;
                });

                function openDiff(type) {
                    vscode.postMessage({
                        command: 'openDiff',
                        stepId: currentStepId,
                        type: type
                    });
                }
            </script>
        </body>
        </html>`;
    }
}
