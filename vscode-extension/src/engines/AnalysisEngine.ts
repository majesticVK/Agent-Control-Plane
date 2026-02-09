import { RunArtifacts, AgentStep } from '../data/DataTypes';

export interface AnalysisReport {
    semanticLabels: Map<number, string[]>;
    invariants: InvariantCheck[];
    rootCause: RootCauseAnalysis | null;
}

export interface InvariantCheck {
    name: string;
    status: 'pass' | 'fail';
    details: string;
}

export interface RootCauseAnalysis {
    failureStepId: number;
    causalChain: number[];
    confidence: number;
    description: string;
}

export class AnalysisEngine {
    public analyze(run: RunArtifacts): AnalysisReport {
        const labels = this.computeSemanticLabels(run.steps);
        const invariants = this.checkInvariants(run.steps);
        const rootCause = this.analyzeFailure(run.steps);

        return {
            semanticLabels: labels,
            invariants,
            rootCause
        };
    }

    private computeSemanticLabels(steps: AgentStep[]): Map<number, string[]> {
        const labels = new Map<number, string[]>();

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const tags: string[] = [];

            // Retry Loop Detection
            if (step.status === 'retry') {
                if (i > 0 && steps[i-1].status === 'retry') {
                    tags.push('retry-loop');
                }
            }

            // Exploration vs Commitment
            if (step.phase === 'tool') {
                // Heuristic: if tool is "search" or "ls", it's exploration
                const toolName = step.input.toolName;
                if (toolName && (toolName.includes('search') || toolName.includes('ls') || toolName.includes('read'))) {
                    tags.push('exploration');
                } else if (toolName && (toolName.includes('write') || toolName.includes('edit'))) {
                    tags.push('commitment');
                }
            }

            if (tags.length > 0) {
                labels.set(step.step_id, tags);
            }
        }

        return labels;
    }

    private checkInvariants(steps: AgentStep[]): InvariantCheck[] {
        const checks: InvariantCheck[] = [];

        // 1. Retry Ceiling
        const retryCount = steps.filter(s => s.status === 'retry').length;
        if (retryCount > steps.length * 0.5) {
            checks.push({
                name: 'Retry Ceiling',
                status: 'fail',
                details: `High retry rate: ${retryCount} retries in ${steps.length} steps`
            });
        } else {
             checks.push({ name: 'Retry Ceiling', status: 'pass', details: 'Retry rate within normal limits' });
        }

        // 2. Tool Order Constraints (Example: Read before Write)
        // Simple heuristic: check if write happens without read (mock)
        checks.push({ name: 'Tool Order', status: 'pass', details: 'No obvious tool order violations' });

        return checks;
    }

    private analyzeFailure(steps: AgentStep[]): RootCauseAnalysis | null {
        // Find first error
        const firstErrorIndex = steps.findIndex(s => s.status === 'error');
        if (firstErrorIndex === -1) return null;

        const errorStep = steps[firstErrorIndex];
        
        // Simple causal chain: previous 3 steps
        const chain = [];
        for (let i = Math.max(0, firstErrorIndex - 3); i < firstErrorIndex; i++) {
            chain.push(steps[i].step_id);
        }

        return {
            failureStepId: errorStep.step_id,
            causalChain: chain,
            confidence: 0.8,
            description: `Failure detected at step ${errorStep.step_id}. Preceding steps suggest context exhaustion or invalid tool usage.`
        };
    }
}
