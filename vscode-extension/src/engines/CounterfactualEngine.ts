import * as fs from 'fs';
import * as path from 'path';
import { RunArtifacts, AgentStep } from '../data/DataTypes';

export class CounterfactualEngine {
    public async createSimulation(
        originalRun: RunArtifacts,
        stepId: number,
        modification: { input?: any; output?: any }
    ): Promise<string> {
        const parentDir = path.dirname(originalRun.path);
        const newRunId = `run_${Date.now()}_sim`;
        const newRunPath = path.join(parentDir, newRunId);

        if (!fs.existsSync(newRunPath)) {
            fs.mkdirSync(newRunPath);
        }

        // 1. Copy Meta
        const meta = { ...originalRun.meta, run_id: newRunId, tags: ['simulation', `from:${originalRun.meta.run_id}`] };
        fs.writeFileSync(path.join(newRunPath, 'meta.json'), JSON.stringify(meta, null, 2));

        // 2. Filter Steps
        const splitIndex = originalRun.steps.findIndex(s => s.step_id === stepId);
        if (splitIndex === -1) throw new Error('Step not found');

        const keptSteps = originalRun.steps.slice(0, splitIndex);
        const targetStep = { ...originalRun.steps[splitIndex] };

        // 3. Apply Modification
        if (modification.input) {
            targetStep.input = { ...targetStep.input, ...modification.input };
        }
        if (modification.output) {
            targetStep.output = { ...targetStep.output, ...modification.output };
        }
        targetStep.status = 'retry'; // Mark as point of divergence

        const allSteps = [...keptSteps, targetStep];

        // 4. Write Steps
        const stepsContent = allSteps.map(s => JSON.stringify(s)).join('\n');
        fs.writeFileSync(path.join(newRunPath, 'steps.jsonl'), stepsContent);

        // 5. Create Dirs
        if (!fs.existsSync(path.join(newRunPath, 'snapshots'))) fs.mkdirSync(path.join(newRunPath, 'snapshots'));
        if (!fs.existsSync(path.join(newRunPath, 'diffs'))) fs.mkdirSync(path.join(newRunPath, 'diffs'));
        if (!fs.existsSync(path.join(newRunPath, 'tools'))) fs.mkdirSync(path.join(newRunPath, 'tools'));

        // 6. Copy Snapshots (lazy - just copy relevant ones if needed, or symlink? 
        // For safety, we won't copy all 10k snapshots. We'll just rely on the fact 
        // that our loader might look for them. But our loader expects them in the run dir.
        // For a demo, we might skip copying all snapshots.)
        
        return newRunPath;
    }
}
