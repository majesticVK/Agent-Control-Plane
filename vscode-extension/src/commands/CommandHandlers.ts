import * as vscode from 'vscode';
import { RunContext } from '../data/RunContext';
import { AnalysisEngine } from '../engines/AnalysisEngine';
import { CounterfactualEngine } from '../engines/CounterfactualEngine';
import { ComparisonEngine } from '../engines/ComparisonEngine';
import { ComparisonViewProvider } from '../ui/ComparisonViewProvider';
import { RunLoader } from '../data/RunLoader';

export async function openRunCommand() {
    const options: vscode.OpenDialogOptions = {
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Open Agent Run',
        title: 'Select Agent Run Directory (run_...)'
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (fileUri && fileUri[0]) {
        await RunContext.getInstance().loadRun(fileUri[0].fsPath);
    }
}

export async function openFailureCommand() {
    const run = RunContext.getInstance().currentRun;
    if (!run) {
        vscode.window.showWarningMessage('No run loaded.');
        return;
    }

    const errorStep = run.steps.find(s => s.status === 'error');
    if (errorStep) {
        const index = run.steps.indexOf(errorStep);
        RunContext.getInstance().setStep(index);
        vscode.window.showInformationMessage(`Jumped to first failure at step ${errorStep.step_id}`);
    } else {
        vscode.window.showInformationMessage('No failures found in this run.');
    }
}

export async function generateReportCommand() {
    const run = RunContext.getInstance().currentRun;
    if (!run) {
        vscode.window.showWarningMessage('No run loaded.');
        return;
    }

    const engine = new AnalysisEngine();
    const report = engine.analyze(run);

    const panel = vscode.window.createWebviewPanel(
        'acpAnalysisReport',
        'Diagnosis Report',
        vscode.ViewColumn.One,
        {}
    );

    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                .pass { color: green; }
                .fail { color: red; font-weight: bold; }
                .section { margin-bottom: 20px; border: 1px solid var(--vscode-panel-border); padding: 15px; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>Run Diagnosis Report</h1>
            <div class="section">
                <h2>Invariants</h2>
                <ul>
                    ${report.invariants.map(inv => `<li>${inv.name}: <span class="${inv.status}">${inv.status.toUpperCase()}</span> - ${inv.details}</li>`).join('')}
                </ul>
            </div>
            
            <div class="section">
                <h2>Root Cause Analysis</h2>
                ${report.rootCause ? `
                    <p><strong>Failure Step:</strong> ${report.rootCause.failureStepId}</p>
                    <p><strong>Confidence:</strong> ${report.rootCause.confidence * 100}%</p>
                    <p>${report.rootCause.description}</p>
                    <p><strong>Causal Chain:</strong> ${report.rootCause.causalChain.join(' -> ')}</p>
                ` : '<p>No root cause identified (no failures).</p>'}
            </div>
        </body>
        </html>
    `;
}

export async function compareRunCommand(extensionUri: vscode.Uri) {
    const currentRun = RunContext.getInstance().currentRun;
    if (!currentRun) {
        vscode.window.showWarningMessage('No base run loaded. Open a run first.');
        return;
    }

    const options: vscode.OpenDialogOptions = {
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Run to Compare',
        title: 'Select Second Run Directory'
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (!fileUri || !fileUri[0]) return;

    try {
        const loader = new RunLoader(fileUri[0].fsPath);
        const secondRun = await loader.load();

        const engine = new ComparisonEngine();
        const result = engine.compare(currentRun, secondRun);

        const view = new ComparisonViewProvider(extensionUri);
        view.show(result);

    } catch (e) {
        vscode.window.showErrorMessage(`Failed to compare runs: ${e}`);
    }
}

export async function counterfactualCommand() {
    const run = RunContext.getInstance().currentRun;
    if (!run) {
        vscode.window.showWarningMessage('No run loaded.');
        return;
    }

    const stepIdStr = await vscode.window.showInputBox({
        prompt: 'Enter Step ID to branch from:',
        placeHolder: 'e.g. 12'
    });
    if (!stepIdStr) return;
    const stepId = parseInt(stepIdStr);

    const modification = await vscode.window.showInputBox({
        prompt: 'Enter new prompt/input (JSON):',
        placeHolder: '{"message": "Corrected prompt"}'
    });
    if (!modification) return;

    try {
        const modJson = JSON.parse(modification);
        const engine = new CounterfactualEngine();
        const newRunPath = await engine.createSimulation(run, stepId, { input: modJson });

        const result = await vscode.window.showInformationMessage(
            `Simulation created at ${newRunPath}. Open it?`,
            'Yes', 'No'
        );

        if (result === 'Yes') {
            await RunContext.getInstance().loadRun(newRunPath);
        }

    } catch (e) {
        vscode.window.showErrorMessage(`Failed to create simulation: ${e}`);
    }
}
