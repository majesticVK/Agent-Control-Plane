/**
 * Agent Control Plane - Trace Recorder
 * 
 * Records every step of agent execution into a structured trace file.
 * This is the CORE MVP piece that enables replay, inspection, and testing.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Trace,
  Step,
  StepType,
  AgentState,
  createTrace,
  LLMStep,
  ToolStep,
  DecisionStep,
  StateStep,
  ErrorStep,
} from './types';

export class TraceRecorder {
  private trace: Trace;
  private outputDir: string;
  private autoSave: boolean;
  private stepStartTime: number = 0;

  constructor(
    agentId: string,
    taskId: string,
    options: {
      outputDir?: string;
      autoSave?: boolean;
    } = {}
  ) {
    this.trace = createTrace(agentId, taskId);
    this.outputDir = options.outputDir || './traces';
    this.autoSave = options.autoSave ?? true;

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Get the current trace
   */
  getTrace(): Trace {
    return this.trace;
  }

  /**
   * Get trace ID
   */
  getTraceId(): string {
    return this.trace.traceId;
  }

  /**
   * Start timing a step
   */
  startStep(): void {
    this.stepStartTime = Date.now();
  }

  /**
   * Calculate step duration
   */
  private getStepDuration(): number {
    return this.stepStartTime ? Date.now() - this.stepStartTime : 0;
  }

  /**
   * Record an LLM call step
   */
  recordLLMStep(
    input: LLMStep['input'],
    output: LLMStep['output'],
    state: AgentState
  ): LLMStep {
    const step: LLMStep = {
      stepNumber: this.trace.steps.length + 1,
      stepType: 'llm',
      timestamp: new Date().toISOString(),
      input,
      output,
      stateSnapshot: this.deepClone(state),
      duration: this.getStepDuration(),
    };

    this.trace.steps.push(step);
    this.trace.metadata.totalLLMCalls++;

    if (this.autoSave) {
      this.save();
    }

    return step;
  }

  /**
   * Record a tool call step
   */
  recordToolStep(
    input: ToolStep['input'],
    output: ToolStep['output'],
    state: AgentState
  ): ToolStep {
    const step: ToolStep = {
      stepNumber: this.trace.steps.length + 1,
      stepType: 'tool',
      timestamp: new Date().toISOString(),
      input,
      output,
      stateSnapshot: this.deepClone(state),
      duration: this.getStepDuration(),
    };

    this.trace.steps.push(step);
    this.trace.metadata.totalToolCalls++;

    // Track tools used
    if (!this.trace.metadata.toolsUsed.includes(input.toolName)) {
      this.trace.metadata.toolsUsed.push(input.toolName);
    }

    if (this.autoSave) {
      this.save();
    }

    return step;
  }

  /**
   * Record a decision step
   */
  recordDecisionStep(
    input: DecisionStep['input'],
    output: DecisionStep['output'],
    state: AgentState
  ): DecisionStep {
    const step: DecisionStep = {
      stepNumber: this.trace.steps.length + 1,
      stepType: 'decision',
      timestamp: new Date().toISOString(),
      input,
      output,
      stateSnapshot: this.deepClone(state),
      duration: this.getStepDuration(),
    };

    this.trace.steps.push(step);

    if (this.autoSave) {
      this.save();
    }

    return step;
  }

  /**
   * Record a state update step
   */
  recordStateStep(
    input: StateStep['input'],
    previousState: AgentState,
    newState: AgentState
  ): StateStep {
    const step: StateStep = {
      stepNumber: this.trace.steps.length + 1,
      stepType: 'state',
      timestamp: new Date().toISOString(),
      input,
      output: {
        previousState: this.deepClone(previousState),
        newState: this.deepClone(newState),
      },
      stateSnapshot: this.deepClone(newState),
      duration: this.getStepDuration(),
    };

    this.trace.steps.push(step);

    if (this.autoSave) {
      this.save();
    }

    return step;
  }

  /**
   * Record an error step
   */
  recordErrorStep(
    input: ErrorStep['input'],
    output: ErrorStep['output'],
    state: AgentState
  ): ErrorStep {
    const step: ErrorStep = {
      stepNumber: this.trace.steps.length + 1,
      stepType: 'error',
      timestamp: new Date().toISOString(),
      input,
      output,
      stateSnapshot: this.deepClone(state),
      duration: this.getStepDuration(),
    };

    this.trace.steps.push(step);

    if (this.autoSave) {
      this.save();
    }

    return step;
  }

  /**
   * Record a generic step
   */
  recordStep(
    stepType: StepType,
    input: unknown,
    output: unknown,
    state: AgentState,
    metadata?: Record<string, unknown>
  ): Step {
    const step: Step = {
      stepNumber: this.trace.steps.length + 1,
      stepType,
      timestamp: new Date().toISOString(),
      input,
      output,
      stateSnapshot: this.deepClone(state),
      duration: this.getStepDuration(),
      metadata,
    };

    this.trace.steps.push(step);

    if (this.autoSave) {
      this.save();
    }

    return step;
  }

  /**
   * Finalize the trace
   */
  finalize(finalState: AgentState, status: 'completed' | 'failed' = 'completed'): Trace {
    this.trace.endTime = new Date().toISOString();
    this.trace.status = status;
    this.trace.finalState = this.deepClone(finalState);

    this.save();

    return this.trace;
  }

  /**
   * Save trace to disk
   */
  save(): string {
    const filename = `${this.trace.traceId}.json`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(this.trace, null, 2));

    return filepath;
  }

  /**
   * Load a trace from disk
   */
  static load(filepath: string): Trace {
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content) as Trace;
  }

  /**
   * List all traces in a directory
   */
  static listTraces(dir: string = './traces'): string[] {
    if (!fs.existsSync(dir)) {
      return [];
    }

    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(dir, f));
  }

  /**
   * Deep clone an object (for state snapshots)
   */
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
