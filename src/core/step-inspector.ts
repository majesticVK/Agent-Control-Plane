/**
 * Agent Control Plane - Step Inspector
 * 
 * Provides detailed inspection of individual steps in a trace.
 * Can be used programmatically or via CLI.
 */

import { Trace, Step, StepType, AgentState, LLMStep, ToolStep, DecisionStep, StateStep, ErrorStep } from './types';
import { TraceRecorder } from './trace-recorder';

export interface StepInspection {
    stepNumber: number;
    stepType: StepType;
    timestamp: string;
    duration: number;
    input: FormattedData;
    output: FormattedData;
    state: FormattedState;
    metadata?: Record<string, unknown>;
    navigation: {
        hasPrevious: boolean;
        hasNext: boolean;
        previousStep?: number;
        nextStep?: number;
    };
}

export interface FormattedData {
    raw: unknown;
    formatted: string;
    summary: string;
}

export interface FormattedState {
    raw: AgentState;
    formatted: string;
    changes?: string[];
}

export interface TraceOverview {
    traceId: string;
    agentId: string;
    taskId: string;
    status: string;
    duration: string;
    stepCount: number;
    llmCalls: number;
    toolCalls: number;
    errors: number;
    toolsUsed: string[];
    stepSummaries: StepSummary[];
}

export interface StepSummary {
    stepNumber: number;
    stepType: StepType;
    summary: string;
    hasError: boolean;
}

export class StepInspector {
    private trace: Trace;

    constructor(trace: Trace) {
        this.trace = trace;
    }

    /**
     * Load from file
     */
    static fromFile(tracePath: string): StepInspector {
        const trace = TraceRecorder.load(tracePath);
        return new StepInspector(trace);
    }

    /**
     * Get trace overview
     */
    getOverview(): TraceOverview {
        const startTime = new Date(this.trace.startTime).getTime();
        const endTime = this.trace.endTime ? new Date(this.trace.endTime).getTime() : Date.now();
        const duration = endTime - startTime;

        const errors = this.trace.steps.filter(s => s.stepType === 'error').length;

        return {
            traceId: this.trace.traceId,
            agentId: this.trace.agentId,
            taskId: this.trace.taskId,
            status: this.trace.status,
            duration: this.formatDuration(duration),
            stepCount: this.trace.steps.length,
            llmCalls: this.trace.metadata.totalLLMCalls,
            toolCalls: this.trace.metadata.totalToolCalls,
            errors,
            toolsUsed: this.trace.metadata.toolsUsed,
            stepSummaries: this.trace.steps.map(step => this.getStepSummary(step)),
        };
    }

    /**
     * Inspect a specific step by number (1-indexed)
     */
    inspectStep(stepNumber: number): StepInspection | null {
        const step = this.trace.steps.find(s => s.stepNumber === stepNumber);
        if (!step) {
            return null;
        }

        const previousStep = this.trace.steps.find(s => s.stepNumber === stepNumber - 1);
        const nextStep = this.trace.steps.find(s => s.stepNumber === stepNumber + 1);

        return {
            stepNumber: step.stepNumber,
            stepType: step.stepType,
            timestamp: step.timestamp,
            duration: step.duration || 0,
            input: this.formatInput(step),
            output: this.formatOutput(step),
            state: this.formatState(step, previousStep),
            metadata: step.metadata,
            navigation: {
                hasPrevious: !!previousStep,
                hasNext: !!nextStep,
                previousStep: previousStep?.stepNumber,
                nextStep: nextStep?.stepNumber,
            },
        };
    }

    /**
     * Get all steps of a specific type
     */
    getStepsByType(stepType: StepType): Step[] {
        return this.trace.steps.filter(s => s.stepType === stepType);
    }

    /**
     * Search steps by content
     */
    searchSteps(query: string): Step[] {
        const lowerQuery = query.toLowerCase();
        return this.trace.steps.filter(step => {
            const inputStr = JSON.stringify(step.input).toLowerCase();
            const outputStr = JSON.stringify(step.output).toLowerCase();
            return inputStr.includes(lowerQuery) || outputStr.includes(lowerQuery);
        });
    }

    /**
     * Get step summary
     */
    private getStepSummary(step: Step): StepSummary {
        let summary = '';

        switch (step.stepType) {
            case 'llm':
                const llmStep = step as LLMStep;
                summary = `LLM: ${llmStep.output.response.substring(0, 50)}...`;
                break;
            case 'tool':
                const toolStep = step as ToolStep;
                summary = `Tool: ${toolStep.input.toolName} ${toolStep.output.success ? '✓' : '✗'}`;
                break;
            case 'decision':
                const decisionStep = step as DecisionStep;
                summary = `Decision: ${decisionStep.output.chosen}`;
                break;
            case 'state':
                summary = 'State update';
                break;
            case 'error':
                const errorStep = step as ErrorStep;
                summary = `Error: ${errorStep.output.error.substring(0, 40)}...`;
                break;
            case 'start':
                summary = 'Agent started';
                break;
            case 'end':
                summary = 'Agent ended';
                break;
        }

        return {
            stepNumber: step.stepNumber,
            stepType: step.stepType,
            summary,
            hasError: step.stepType === 'error',
        };
    }

    /**
     * Format input for display
     */
    private formatInput(step: Step): FormattedData {
        const raw = step.input;
        const formatted = JSON.stringify(raw, null, 2);

        let summary = '';
        switch (step.stepType) {
            case 'llm':
                const llmInput = step.input as LLMStep['input'];
                summary = `Prompt: ${llmInput.prompt.substring(0, 100)}...`;
                break;
            case 'tool':
                const toolInput = step.input as ToolStep['input'];
                summary = `Tool: ${toolInput.toolName}, Params: ${JSON.stringify(toolInput.parameters)}`;
                break;
            default:
                summary = formatted.substring(0, 100);
        }

        return { raw, formatted, summary };
    }

    /**
     * Format output for display
     */
    private formatOutput(step: Step): FormattedData {
        const raw = step.output;
        const formatted = JSON.stringify(raw, null, 2);

        let summary = '';
        switch (step.stepType) {
            case 'llm':
                const llmOutput = step.output as LLMStep['output'];
                summary = `Response: ${llmOutput.response.substring(0, 100)}...`;
                break;
            case 'tool':
                const toolOutput = step.output as ToolStep['output'];
                summary = `Success: ${toolOutput.success}, Result: ${JSON.stringify(toolOutput.result).substring(0, 50)}`;
                break;
            case 'error':
                const errorOutput = step.output as ErrorStep['output'];
                summary = `Error: ${errorOutput.error}`;
                break;
            default:
                summary = formatted.substring(0, 100);
        }

        return { raw, formatted, summary };
    }

    /**
     * Format state for display
     */
    private formatState(step: Step, previousStep?: Step): FormattedState {
        const raw = step.stateSnapshot;
        const formatted = JSON.stringify(raw, null, 2);

        const changes: string[] = [];

        if (previousStep) {
            const prev = previousStep.stateSnapshot;
            const curr = step.stateSnapshot;

            if (prev.currentStep !== curr.currentStep) {
                changes.push(`currentStep: ${prev.currentStep} → ${curr.currentStep}`);
            }
            if (prev.status !== curr.status) {
                changes.push(`status: ${prev.status} → ${curr.status}`);
            }
            if (Object.keys(curr.memory).length !== Object.keys(prev.memory).length) {
                changes.push(`memory keys: ${Object.keys(prev.memory).length} → ${Object.keys(curr.memory).length}`);
            }
            if (curr.context.length !== prev.context.length) {
                changes.push(`context items: ${prev.context.length} → ${curr.context.length}`);
            }
        }

        return { raw, formatted, changes };
    }

    /**
     * Format duration for display
     */
    private formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
        return `${(ms / 60000).toFixed(2)}m`;
    }

    /**
     * Get the raw trace
     */
    getTrace(): Trace {
        return this.trace;
    }
}
