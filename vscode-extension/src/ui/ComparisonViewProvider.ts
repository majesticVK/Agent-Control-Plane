import * as vscode from 'vscode';
import { RunComparison } from '../engines/ComparisonEngine';

export class ComparisonViewProvider {
    public static readonly viewType = 'acp.comparisonView';
    private panel: vscode.WebviewPanel | undefined;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public show(comparison: RunComparison) {
        if (this.panel) {
            this.panel.reveal();
        } else {
            this.panel = vscode.window.createWebviewPanel(
                ComparisonViewProvider.viewType,
                `Compare: ${comparison.runId1} vs ${comparison.runId2}`,
                vscode.ViewColumn.One,
                { enableScripts: true }
            );
            this.panel.onDidDispose(() => this.panel = undefined);
        }

        this.panel.webview.html = this.getHtml(comparison);
    }

    private getHtml(comparison: RunComparison): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
                .metrics { display: flex; gap: 20px; font-size: 12px; }
                .metric { font-weight: bold; }
                .row { display: flex; border-bottom: 1px solid var(--vscode-panel-border); }
                .cell { flex: 1; padding: 8px; font-size: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
                .cell.left { border-right: 1px solid var(--vscode-panel-border); }
                .match-exact { background-color: rgba(76, 175, 80, 0.1); }
                .match-phase { background-color: rgba(255, 152, 0, 0.1); }
                .match-mismatch { background-color: rgba(244, 67, 54, 0.1); }
                .divergence-marker { color: red; font-weight: bold; margin-bottom: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>Run Comparison</h2>
                <div class="metrics">
                    <span>Δ Duration: <span class="metric">${comparison.metricsDiff.duration}ms</span></span>
                    <span>Δ Steps: <span class="metric">${comparison.metricsDiff.steps}</span></span>
                </div>
            </div>
            
            ${comparison.divergencePoint ? `<div class="divergence-marker">⚠️ Divergence detected at Step ${comparison.divergencePoint}</div>` : '<div style="color: green">Runs are identical</div>'}

            <div class="table">
                <div class="row" style="font-weight: bold;">
                    <div class="cell left">${comparison.runId1}</div>
                    <div class="cell">${comparison.runId2}</div>
                </div>
                ${comparison.stepAlignment.map(row => `
                    <div class="row match-${row.matchType}">
                        <div class="cell left">
                            ${row.step1 !== null ? `Step ${row.step1}` : '-'}
                        </div>
                        <div class="cell">
                            ${row.step2 !== null ? `Step ${row.step2}` : '-'}
                        </div>
                    </div>
                `).join('')}
            </div>
        </body>
        </html>`;
    }
}
