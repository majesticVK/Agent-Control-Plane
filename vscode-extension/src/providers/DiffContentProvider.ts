import * as vscode from 'vscode';
import { RunContext } from '../data/RunContext';

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
    public static readonly scheme = 'acp-diff';

    provideTextDocumentContent(uri: vscode.Uri): string {
        // Fix: Use URLSearchParams to parse query string properly
        const params = new URLSearchParams(uri.query);
        const stepId = parseInt(params.get('stepId') || '0');
        const type = params.get('type'); // 'prompt' | 'memory'

        const loader = RunContext.getInstance().loader;
        if (!loader) return 'No run loaded';

        const step = RunContext.getInstance().currentRun?.steps.find(s => s.step_id === stepId);
        if (!step) return 'Step not found';

        if (type === 'prompt') {
            // Assuming prompt is in input
            return JSON.stringify(step.input, null, 2);
        } else if (type === 'memory') {
            const snapshot = loader.getSnapshot(stepId);
            return snapshot ? JSON.stringify(snapshot.memory, null, 2) : 'No snapshot';
        }

        return 'Unknown type';
    }
}
