/**
 * Agent Control Plane - Core Type Definitions
 * 
 * These types define the structure for:
 * - Agent state
 * - Trace records
 * - Step types
 * - Tool definitions
 */

// ============================================
// STEP TYPES
// ============================================

export type StepType = 'llm' | 'tool' | 'decision' | 'state' | 'error' | 'start' | 'end';

export interface BaseStep {
    stepNumber: number;
    stepType: StepType;
    timestamp: string;
    input: unknown;
    output: unknown;
    stateSnapshot: AgentState;
    duration?: number;
    metadata?: Record<string, unknown>;
}

export interface LLMStep extends BaseStep {
    stepType: 'llm';
    input: {
        prompt: string;
        context?: string;
        previousOutput?: string;
    };
    output: {
        response: string;
        action?: string;
        reasoning?: string;
    };
}

export interface ToolStep extends BaseStep {
    stepType: 'tool';
    input: {
        toolName: string;
        parameters: Record<string, unknown>;
    };
    output: {
        result: unknown;
        success: boolean;
        error?: string;
    };
}

export interface DecisionStep extends BaseStep {
    stepType: 'decision';
    input: {
        options: string[];
        context: string;
    };
    output: {
        chosen: string;
        reason: string;
    };
}

export interface StateStep extends BaseStep {
    stepType: 'state';
    input: {
        action: 'update' | 'reset' | 'merge';
        changes: Partial<AgentState>;
    };
    output: {
        previousState: AgentState;
        newState: AgentState;
    };
}

export interface ErrorStep extends BaseStep {
    stepType: 'error';
    input: {
        operation: string;
        context: unknown;
    };
    output: {
        error: string;
        stack?: string;
        recoverable: boolean;
    };
}

export type Step = LLMStep | ToolStep | DecisionStep | StateStep | ErrorStep | BaseStep;

// ============================================
// AGENT STATE
// ============================================

export interface AgentState {
    taskId: string;
    status: 'idle' | 'running' | 'completed' | 'failed' | 'paused';
    currentStep: number;
    memory: Record<string, unknown>;
    context: string[];
    goal: string;
    subGoals: string[];
    completedSubGoals: string[];
    lastOutput?: string;
    startTime?: string;
    endTime?: string;
}

export function createInitialState(taskId: string, goal: string): AgentState {
    return {
        taskId,
        status: 'idle',
        currentStep: 0,
        memory: {},
        context: [],
        goal,
        subGoals: [],
        completedSubGoals: [],
        startTime: new Date().toISOString(),
    };
}

// ============================================
// TRACE
// ============================================

export interface Trace {
    traceId: string;
    agentId: string;
    taskId: string;
    startTime: string;
    endTime?: string;
    status: 'running' | 'completed' | 'failed' | 'replayed';
    steps: Step[];
    finalState?: AgentState;
    metadata: {
        agentVersion: string;
        toolsUsed: string[];
        totalLLMCalls: number;
        totalToolCalls: number;
        replayedFrom?: string;
    };
}

export function createTrace(agentId: string, taskId: string): Trace {
    return {
        traceId: `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        agentId,
        taskId,
        startTime: new Date().toISOString(),
        status: 'running',
        steps: [],
        metadata: {
            agentVersion: '1.0.0',
            toolsUsed: [],
            totalLLMCalls: 0,
            totalToolCalls: 0,
        },
    };
}

// ============================================
// TOOLS
// ============================================

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        name: string;
        type: string;
        description: string;
        required: boolean;
    }[];
    execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
    success: boolean;
    result: unknown;
    error?: string;
}

// ============================================
// LLM INTERFACE
// ============================================

export interface LLMRequest {
    prompt: string;
    context?: string;
    previousOutput?: string;
    systemPrompt?: string;
}

export interface LLMResponse {
    response: string;
    action?: string;
    reasoning?: string;
    toolCall?: {
        toolName: string;
        parameters: Record<string, unknown>;
    };
    shouldContinue: boolean;
}

export interface LLMProvider {
    name: string;
    call: (request: LLMRequest) => Promise<LLMResponse>;
}

// ============================================
// TEST ASSERTIONS
// ============================================

export interface TestAssertion {
    type: 'tool_called' | 'tool_not_called' | 'max_steps' | 'min_steps' |
    'state_contains' | 'state_not_contains' | 'step_type_count' | 'custom';
    params: Record<string, unknown>;
    message?: string;
}

export interface TestCase {
    name: string;
    description?: string;
    traceFile?: string;
    assertions: TestAssertion[];
}

export interface TestResult {
    testName: string;
    passed: boolean;
    assertions: {
        assertion: TestAssertion;
        passed: boolean;
        actual?: unknown;
        message: string;
    }[];
    duration: number;
}

// ============================================
// ANALYSIS
// ============================================

export interface AnalysisWarning {
    type: 'high_step_count' | 'memory_growth' | 'repeated_tool_calls' |
    'unused_memory' | 'long_duration' | 'error_rate';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    details: Record<string, unknown>;
    stepNumbers?: number[];
}

export interface AnalysisReport {
    traceId: string;
    summary: {
        totalSteps: number;
        totalDuration: number;
        llmCalls: number;
        toolCalls: number;
        errors: number;
        memoryPeakSize: number;
    };
    warnings: AnalysisWarning[];
    recommendations: string[];
}
