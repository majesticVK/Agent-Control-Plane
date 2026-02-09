import { RunArtifacts, AgentStep } from '../data/DataTypes';

export interface RunComparison {
    runId1: string;
    runId2: string;
    stepAlignment: { step1: number | null, step2: number | null, matchType: 'exact' | 'phase' | 'mismatch' }[];
    divergencePoint: number | null; // Step index in Run 1 where they diverge
    metricsDiff: {
        duration: number; // run2 - run1
        tokens: number;
        steps: number;
    };
}

export class ComparisonEngine {
    public compare(run1: RunArtifacts, run2: RunArtifacts): RunComparison {
        const alignment = this.alignSteps(run1.steps, run2.steps);
        const divergence = this.findDivergence(run1.steps, run2.steps);
        
        const metrics1 = this.computeMetrics(run1);
        const metrics2 = this.computeMetrics(run2);

        return {
            runId1: run1.meta.run_id,
            runId2: run2.meta.run_id,
            stepAlignment: alignment,
            divergencePoint: divergence,
            metricsDiff: {
                duration: metrics2.duration - metrics1.duration,
                tokens: metrics2.tokens - metrics1.tokens,
                steps: metrics2.steps - metrics1.steps
            }
        };
    }

    private computeMetrics(run: RunArtifacts) {
        // Mock metrics for now as we don't strictly track tokens in run meta yet
        return {
            duration: (run.steps[run.steps.length-1]?.timestamp || 0) - (run.steps[0]?.timestamp || 0),
            tokens: 0, 
            steps: run.steps.length
        };
    }

    private alignSteps(steps1: AgentStep[], steps2: AgentStep[]) {
        const alignment: { step1: number | null, step2: number | null, matchType: 'exact' | 'phase' | 'mismatch' }[] = [];
        const maxLen = Math.max(steps1.length, steps2.length);

        for (let i = 0; i < maxLen; i++) {
            const s1 = steps1[i];
            const s2 = steps2[i];

            if (s1 && s2) {
                if (s1.phase === s2.phase && JSON.stringify(s1.input) === JSON.stringify(s2.input)) {
                    alignment.push({ step1: s1.step_id, step2: s2.step_id, matchType: 'exact' });
                } else if (s1.phase === s2.phase) {
                    alignment.push({ step1: s1.step_id, step2: s2.step_id, matchType: 'phase' });
                } else {
                    alignment.push({ step1: s1.step_id, step2: s2.step_id, matchType: 'mismatch' });
                }
            } else if (s1) {
                alignment.push({ step1: s1.step_id, step2: null, matchType: 'mismatch' });
            } else {
                alignment.push({ step1: null, step2: s2.step_id, matchType: 'mismatch' });
            }
        }
        return alignment;
    }

    private findDivergence(steps1: AgentStep[], steps2: AgentStep[]): number | null {
        const minLen = Math.min(steps1.length, steps2.length);
        for (let i = 0; i < minLen; i++) {
            const s1 = steps1[i];
            const s2 = steps2[i];
            
            // Check for significant divergence (different tool calls or different LLM outputs)
            // For now, strict equality on input/output
            if (JSON.stringify(s1.input) !== JSON.stringify(s2.input)) {
                return s1.step_id;
            }
            // If output differs, it's a divergence, but maybe less critical for control flow unless it changes next step
            // But let's mark it.
            if (JSON.stringify(s1.output) !== JSON.stringify(s2.output)) {
                return s1.step_id;
            }
        }
        
        if (steps1.length !== steps2.length) {
            return steps1[Math.min(steps1.length, steps2.length) - 1]?.step_id || 0;
        }
        
        return null; // Identical runs
    }
}
