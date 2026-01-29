/**
 * Agent Control Plane - Minimal Agent Runtime
 * 
 * A simple, explicit execution loop that:
 * - Maintains agent state
 * - Calls LLM
 * - Calls tools
 * - Advances steps
 * - Records everything to a trace
 */

import {
    AgentState,
    LLMProvider,
    LLMRequest,
    LLMResponse,
    ToolDefinition,
    ToolResult,
    Trace,
    createInitialState,
} from './types';
import { TraceRecorder } from './trace-recorder';

export interface AgentConfig {
    agentId: string;
    maxSteps?: number;
    llmProvider: LLMProvider;
    tools: ToolDefinition[];
    systemPrompt?: string;
    outputDir?: string;
    onStepComplete?: (step: number, state: AgentState) => void;
}

export interface AgentRunResult {
    success: boolean;
    finalState: AgentState;
    trace: Trace;
    traceFile: string;
    error?: string;
}

export class AgentRuntime {
    private config: AgentConfig;
    private state: AgentState;
    private recorder: TraceRecorder;
    private tools: Map<string, ToolDefinition>;
    private isRunning: boolean = false;

    constructor(config: AgentConfig) {
        this.config = {
            maxSteps: 50,
            ...config,
        };

        this.state = createInitialState('', '');
        this.recorder = new TraceRecorder(config.agentId, '', { outputDir: config.outputDir });
        this.tools = new Map();

        // Register tools
        for (const tool of config.tools) {
            this.tools.set(tool.name, tool);
        }
    }

    /**
     * Run the agent with a given goal
     */
    async run(taskId: string, goal: string): Promise<AgentRunResult> {
        // Initialize state
        this.state = createInitialState(taskId, goal);
        this.state.status = 'running';

        // Initialize recorder
        this.recorder = new TraceRecorder(this.config.agentId, taskId, {
            outputDir: this.config.outputDir,
        });

        this.isRunning = true;

        // Record start
        this.recorder.recordStep('start', { goal }, { message: 'Agent started' }, this.state);

        try {
            // Main agent loop
            while (this.isRunning && this.state.currentStep < (this.config.maxSteps || 50)) {
                this.state.currentStep++;

                // Build LLM request
                const llmRequest = this.buildLLMRequest();

                // Call LLM
                this.recorder.startStep();
                const llmResponse = await this.config.llmProvider.call(llmRequest);

                // Record LLM step
                this.recorder.recordLLMStep(
                    {
                        prompt: llmRequest.prompt,
                        context: llmRequest.context,
                        previousOutput: llmRequest.previousOutput,
                    },
                    {
                        response: llmResponse.response,
                        action: llmResponse.action,
                        reasoning: llmResponse.reasoning,
                    },
                    this.state
                );

                // Update state with LLM response
                this.state.lastOutput = llmResponse.response;
                this.state.context.push(`Step ${this.state.currentStep}: ${llmResponse.response.substring(0, 100)}`);

                // Check if we should stop
                if (!llmResponse.shouldContinue) {
                    this.state.status = 'completed';
                    break;
                }

                // Execute tool if requested
                if (llmResponse.toolCall) {
                    const toolResult = await this.executeTool(
                        llmResponse.toolCall.toolName,
                        llmResponse.toolCall.parameters
                    );

                    // Store tool result in memory
                    this.state.memory[`tool_${this.state.currentStep}`] = {
                        tool: llmResponse.toolCall.toolName,
                        result: toolResult.result,
                        success: toolResult.success,
                    };

                    // If tool failed, record error
                    if (!toolResult.success) {
                        this.recorder.recordErrorStep(
                            { operation: 'tool_call', context: llmResponse.toolCall },
                            { error: toolResult.error || 'Unknown error', recoverable: true },
                            this.state
                        );
                    }
                }

                // Callback
                if (this.config.onStepComplete) {
                    this.config.onStepComplete(this.state.currentStep, this.state);
                }
            }

            // Check if we hit max steps
            if (this.state.currentStep >= (this.config.maxSteps || 50)) {
                this.state.status = 'failed';
                this.recorder.recordErrorStep(
                    { operation: 'agent_loop', context: { maxSteps: this.config.maxSteps } },
                    { error: 'Max steps exceeded', recoverable: false },
                    this.state
                );
            }

            // Record end
            this.recorder.recordStep('end', { finalStep: this.state.currentStep }, { status: this.state.status }, this.state);

            // Finalize state
            this.state.endTime = new Date().toISOString();
            const trace = this.recorder.finalize(this.state, this.state.status === 'completed' ? 'completed' : 'failed');

            return {
                success: this.state.status === 'completed',
                finalState: this.state,
                trace,
                traceFile: this.recorder.save(),
            };

        } catch (error) {
            this.state.status = 'failed';
            this.state.endTime = new Date().toISOString();

            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;

            this.recorder.recordErrorStep(
                { operation: 'agent_runtime', context: { step: this.state.currentStep } },
                { error: errorMessage, stack: errorStack, recoverable: false },
                this.state
            );

            const trace = this.recorder.finalize(this.state, 'failed');

            return {
                success: false,
                finalState: this.state,
                trace,
                traceFile: this.recorder.save(),
                error: errorMessage,
            };
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Stop the agent
     */
    stop(): void {
        this.isRunning = false;
        this.state.status = 'paused';
    }

    /**
     * Get current state
     */
    getState(): AgentState {
        return this.state;
    }

    /**
     * Build LLM request from current state
     */
    private buildLLMRequest(): LLMRequest {
        const toolDescriptions = Array.from(this.tools.values())
            .map(t => `- ${t.name}: ${t.description}`)
            .join('\n');

        const contextStr = this.state.context.slice(-5).join('\n');

        const prompt = `
Goal: ${this.state.goal}

Available Tools:
${toolDescriptions}

Current Step: ${this.state.currentStep}
Previous Context:
${contextStr}

${this.state.lastOutput ? `Last Output: ${this.state.lastOutput}` : ''}

What should be the next action? If the goal is complete, respond with DONE.
If you need to use a tool, specify which tool and what parameters.
`.trim();

        return {
            prompt,
            context: contextStr,
            previousOutput: this.state.lastOutput,
            systemPrompt: this.config.systemPrompt,
        };
    }

    /**
     * Execute a tool
     */
    private async executeTool(toolName: string, parameters: Record<string, unknown>): Promise<ToolResult> {
        const tool = this.tools.get(toolName);

        if (!tool) {
            return {
                success: false,
                result: null,
                error: `Tool not found: ${toolName}`,
            };
        }

        this.recorder.startStep();

        try {
            const result = await tool.execute(parameters);

            this.recorder.recordToolStep(
                { toolName, parameters },
                { result: result.result, success: result.success, error: result.error },
                this.state
            );

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.recorder.recordToolStep(
                { toolName, parameters },
                { result: null, success: false, error: errorMessage },
                this.state
            );

            return {
                success: false,
                result: null,
                error: errorMessage,
            };
        }
    }
}
