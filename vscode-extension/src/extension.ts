import * as vscode from 'vscode';
import { TimelineProvider } from './ui/TimelineProvider';
import { StateInspectorProvider } from './ui/StateInspectorProvider';
import { HierarchyProvider } from './ui/HierarchyProvider';
import { DiffContentProvider } from './providers/DiffContentProvider';
import { DiffViewProvider } from './ui/DiffViewProvider';
import * as commands from './commands/CommandHandlers';

export function activate(context: vscode.ExtensionContext) {
    console.log('Agent Replay Debugger is active');

    // Providers
    const timelineProvider = new TimelineProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TimelineProvider.viewType, timelineProvider)
    );

    const stateProvider = new StateInspectorProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(StateInspectorProvider.viewType, stateProvider)
    );

    const diffViewProvider = new DiffViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DiffViewProvider.viewType, diffViewProvider)
    );

    const hierarchyProvider = new HierarchyProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('acp.hierarchyView', hierarchyProvider)
    );

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(DiffContentProvider.scheme, new DiffContentProvider())
    );

    // Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('acp.openRun', commands.openRunCommand),
        vscode.commands.registerCommand('acp.openFailure', commands.openFailureCommand),
        vscode.commands.registerCommand('acp.generateReport', commands.generateReportCommand),
        vscode.commands.registerCommand('acp.compareRun', () => commands.compareRunCommand(context.extensionUri)),
        vscode.commands.registerCommand('acp.counterfactual', commands.counterfactualCommand),
        vscode.commands.registerCommand('acp.jumpToStep', (stepId: number) => {
             // Find index
             const run = require('./data/RunContext').RunContext.getInstance().currentRun;
             if(run) {
                 const index = run.steps.findIndex((s: any) => s.step_id === stepId);
                 if(index !== -1) require('./data/RunContext').RunContext.getInstance().setStep(index);
             }
        })
    );
}

export function deactivate() {}
