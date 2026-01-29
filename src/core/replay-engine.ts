/**
 * Agent Control Plane - Deterministic Replay Engine
 * 
 * Replays agent execution from a recorded trace.
 * LLM calls and tool calls return recorded outputs instead of executing live.
 */

import {
    AgentState,
    LLMProvider,
    LLMRequest,
    LLMResponse,
    Trace,
    Step,
    LLMStep,
    ToolStep,
    ToolDefinition,
    ToolResult,
    createInitialState,
} from './types';
import { TraceRecorder } from './trace-recorder';

export interface ReplayResult {
    success: boolean;
    originalTrace: Trace;
    replayTrace: Trace;
    finalState: AgentState;
    stateMatch: boolean;
    stepCount: {
        original: number;
        replay: number;
        match: boolean;
    };
    divergences: Divergence[];
}

export interface Divergence {
    stepNumber: number;
    type: 'state_mismatch' | 'output_mismatch' | 'missing_step' | 'extra_step';
    expected: unknown;
    actual: unknown;
    message: string;
}

export class ReplayEngine {
    private trace: Trace;
    private currentStepIndex: number = 0;
    private replayRecorder: TraceRecorder;
    private replayState: AgentState;
    private divergences: Divergence[] = [];

    constructor(trace: Trace) {
        this.trace = trace;
        this.replayState = createInitialState(trace.taskId, '');
        this.replayRecorder = new TraceRecorder(
            trace.agentId,
            trace.taskId,
            { outputDir: './traces/replays' }
        );
    }

    /**
     * Create a mock LLM provider that returns recorded outputs
     */
    createReplayLLMProvider(): LLMProvider {
        return {
            name: 'replay-provider',
            call: async (request: LLMRequest): Promise<LLMResponse> => {
                // Find the next LLM step in the trace
                const llmStep = this.findNextStep('llm') as LLMStep | undefined;

                if (!llmStep) {
                    return {
                        response: 'DONE',
                        shouldContinue: false,
                    };
                }

                // Return the recorded output
                return {
                    response: llmStep.output.response,
                    action: llmStep.output.action,
                    reasoning: llmStep.output.reasoning,
                    shouldContinue: this.hasMoreSteps(),
                    toolCall: this.findNextToolCall(llmStep),
                };
            },
        };
    }

    /**
     * Create mock tools that return recorded outputs
     */
    createReplayTools(): ToolDefinition[] {
        const toolNames = this.trace.metadata.toolsUsed;

        return toolNames.map(toolName => ({
            name: toolName,
            description: `Replay mock for ${toolName}`,
            parameters: [],
            execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
                const toolStep = this.findNextStep('tool') as ToolStep | undefined;

                if (!toolStep || toolStep.input.toolName !== toolName) {
                    return {
                        success: false,
                        result: null,
                        error: `No recorded output for tool: ${toolName}`,
                    };
                }

                return {
                    success: toolStep.output.success,
                    result: toolStep.output.result,
                    error: toolStep.output.error,
                };
            },
        }));
    }

    /**
     * Execute a full replay
     */
    async replay(): Promise<ReplayResult> {
        this.currentStepIndex = 0;
        this.divergences = [];

        // Initialize replay state from the first step
        const firstStep = this.trace.steps[0];
        if (firstStep) {
            this.replayState = { ...firstStep.stateSnapshot };
        }

        // Replay each step
        for (const step of this.trace.steps) {
            this.currentStepIndex++;
            await this.replayStep(step);
        }

        // Build replay trace
        const replayTrace = this.replayRecorder.finalize(this.replayState, 'completed');
        replayTrace.status = 'replayed';
        replayTrace.metadata.replayedFrom = this.trace.traceId;

        // Compare final states
        const stateMatch = this.compareStates(
            this.trace.finalState || this.trace.steps[this.trace.steps.length - 1]?.stateSnapshot,
            this.replayState
        );

        return {
            success: this.divergences.length === 0,
            originalTrace: this.trace,
            replayTrace,
            finalState: this.replayState,
            stateMatch,
            stepCount: {
                original: this.trace.steps.length,
                replay: replayTrace.steps.length,
                match: this.trace.steps.length === replayTrace.steps.length,
            },
            divergences: this.divergences,
        };
    }

    /**
     * Replay a single step
     */
    private async replayStep(step: Step): Promise<void> {
        // Record the replayed step
        this.replayRecorder.recordStep(
            step.stepType,
            step.input,
            step.output,
            step.stateSnapshot,
            { replayed: true, originalStepNumber: step.stepNumber }
        );

        // Update replay state
        this.replayState = { ...step.stateSnapshot };

        // Check for state divergence (in a real replay with live execution)
        // For now, we just copy the state
    }

    /**
     * Find the next step of a given type
     */
    private findNextStep(stepType: string): Step | undefined {
        for (let i = this.currentStepIndex; i < this.trace.steps.length; i++) {
            if (this.trace.steps[i].stepType === stepType) {
                this.currentStepIndex = i + 1;
                return this.trace.steps[i];
            }
        }
        return undefined;
    }

    /**
     * Check if there are more steps
     */
    private hasMoreSteps(): boolean {
        return this.currentStepIndex < this.trace.steps.length - 1;
    }

    /**
     * Find tool call after an LLM step
     */
    private findNextToolCall(llmStep: LLMStep): { toolName: string; parameters: Record<string, unknown> } | undefined {
        const nextStep = this.trace.steps[this.currentStepIndex];
        if (nextStep && nextStep.stepType === 'tool') {
            const toolStep = nextStep as ToolStep;
            return {
                toolName: toolStep.input.toolName,
                parameters: toolStep.input.parameters,
            };
        }
        return undefined;
    }

    /**
     * Compare two states for equality
     */
    private compareStates(state1: AgentState | undefined, state2: AgentState): boolean {
        if (!state1) return false;

        // Compare key fields
        const keysToCompare: (keyof AgentState)[] = [
            'status',
            'currentStep',
            'goal',
        ];

        for (const key of keysToCompare) {
            if (JSON.stringify(state1[key]) !== JSON.stringify(state2[key])) {
                this.divergences.push({
                    stepNumber: this.currentStepIndex,
                    type: 'state_mismatch',
                    expected: state1[key],
                    actual: state2[key],
                    message: `State mismatch in field: ${key}`,
                });
                return false;
            }
        }

        return true;
    }

    /**
     * Get divergences
     */
    getDivergences(): Divergence[] {
        return this.divergences;
    }

    /**
     * Static method to replay from a trace file
     */
    static async replayFromFile(tracePath: string): Promise<ReplayResult> {
        const trace = TraceRecorder.load(tracePath);
        const engine = new ReplayEngine(trace);
        return engine.replay();
    }
}
