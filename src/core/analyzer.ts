/**
 * Agent Control Plane - Memory & Step Analyzer
 * 
 * Provides basic analysis over traces to identify:
 * - High step counts
 * - Memory growth issues
 * - Repeated tool calls
 * - Inefficiencies
 */

import {
  Trace,
  Step,
  ToolStep,
  AnalysisWarning,
  AnalysisReport,
} from './types';
import { TraceRecorder } from './trace-recorder';

export interface AnalyzerConfig {
  maxStepsWarning: number;
  maxStepsCritical: number;
  memoryGrowthThreshold: number;
  repeatedToolThreshold: number;
  longDurationThreshold: number;
}

const DEFAULT_CONFIG: AnalyzerConfig = {
  maxStepsWarning: 10,
  maxStepsCritical: 20,
  memoryGrowthThreshold: 5,
  repeatedToolThreshold: 3,
  longDurationThreshold: 5000,
};

export class TraceAnalyzer {
  private trace: Trace;
  private config: AnalyzerConfig;

  constructor(trace: Trace, config: Partial<AnalyzerConfig> = {}) {
    this.trace = trace;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load analyzer from trace file
   */
  static fromFile(tracePath: string, config?: Partial<AnalyzerConfig>): TraceAnalyzer {
    const trace = TraceRecorder.load(tracePath);
    return new TraceAnalyzer(trace, config);
  }

  /**
   * Run full analysis
   */
  analyze(): AnalysisReport {
    const warnings: AnalysisWarning[] = [];

    // Check step count
    warnings.push(...this.checkStepCount());

    // Check memory growth
    warnings.push(...this.checkMemoryGrowth());

    // Check repeated tool calls
    warnings.push(...this.checkRepeatedToolCalls());

    // Check for unused memory
    warnings.push(...this.checkUnusedMemory());

    // Check for long durations
    warnings.push(...this.checkLongDurations());

    // Check error rate
    warnings.push(...this.checkErrorRate());

    // Generate summary
    const summary = this.generateSummary();

    // Generate recommendations
    const recommendations = this.generateRecommendations(warnings);

    return {
      traceId: this.trace.traceId,
      summary,
      warnings,
      recommendations,
    };
  }

  /**
   * Check if step count is high
   */
  private checkStepCount(): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];
    const stepCount = this.trace.steps.length;

    if (stepCount >= this.config.maxStepsCritical) {
      warnings.push({
        type: 'high_step_count',
        severity: 'critical',
        message: `Step count (${stepCount}) is critically high`,
        details: {
          stepCount,
          threshold: this.config.maxStepsCritical,
        },
      });
    } else if (stepCount >= this.config.maxStepsWarning) {
      warnings.push({
        type: 'high_step_count',
        severity: 'warning',
        message: `Step count (${stepCount}) is unusually high`,
        details: {
          stepCount,
          threshold: this.config.maxStepsWarning,
        },
      });
    }

    return warnings;
  }

  /**
   * Check for memory growth without usage
   */
  private checkMemoryGrowth(): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];
    const memorySizes: { step: number; size: number }[] = [];

    for (const step of this.trace.steps) {
      const memorySize = Object.keys(step.stateSnapshot.memory).length;
      memorySizes.push({ step: step.stepNumber, size: memorySize });
    }

    // Check if memory is constantly growing
    let growthCount = 0;
    for (let i = 1; i < memorySizes.length; i++) {
      if (memorySizes[i].size > memorySizes[i - 1].size) {
        growthCount++;
      }
    }

    if (growthCount >= this.config.memoryGrowthThreshold) {
      warnings.push({
        type: 'memory_growth',
        severity: 'warning',
        message: 'Memory growing continuously without apparent use',
        details: {
          initialSize: memorySizes[0]?.size || 0,
          finalSize: memorySizes[memorySizes.length - 1]?.size || 0,
          growthEvents: growthCount,
        },
      });
    }

    return warnings;
  }

  /**
   * Check for repeated tool calls (same tool, same parameters)
   */
  private checkRepeatedToolCalls(): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];
    const toolCalls: Map<string, number[]> = new Map();

    for (const step of this.trace.steps) {
      if (step.stepType === 'tool') {
        const toolStep = step as ToolStep;
        const key = `${toolStep.input.toolName}:${JSON.stringify(toolStep.input.parameters)}`;

        if (!toolCalls.has(key)) {
          toolCalls.set(key, []);
        }
        toolCalls.get(key)!.push(step.stepNumber);
      }
    }

    for (const [key, steps] of toolCalls) {
      if (steps.length >= this.config.repeatedToolThreshold) {
        const [toolName] = key.split(':');
        warnings.push({
          type: 'repeated_tool_calls',
          severity: 'warning',
          message: `Tool '${toolName}' called ${steps.length} times with same parameters`,
          details: {
            toolName,
            callCount: steps.length,
          },
          stepNumbers: steps,
        });
      }
    }

    return warnings;
  }

  /**
   * Check for memory that was written but never read
   */
  private checkUnusedMemory(): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];

    // Get final memory keys
    const finalState = this.trace.finalState || this.trace.steps[this.trace.steps.length - 1]?.stateSnapshot;
    if (!finalState) return warnings;

    const memoryKeys = Object.keys(finalState.memory);

    // Check if any memory keys were added but never referenced in subsequent steps
    const unusedKeys: string[] = [];
    for (const key of memoryKeys) {
      let wasUsed = false;

      // Simple heuristic: check if the key appears in any LLM context
      for (const step of this.trace.steps) {
        if (step.stepType === 'llm') {
          const inputStr = JSON.stringify(step.input);
          if (inputStr.includes(key)) {
            wasUsed = true;
            break;
          }
        }
      }

      if (!wasUsed) {
        unusedKeys.push(key);
      }
    }

    if (unusedKeys.length > 0) {
      warnings.push({
        type: 'unused_memory',
        severity: 'info',
        message: `${unusedKeys.length} memory key(s) may be unused`,
        details: {
          unusedKeys,
          totalKeys: memoryKeys.length,
        },
      });
    }

    return warnings;
  }

  /**
   * Check for steps with long duration
   */
  private checkLongDurations(): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];
    const slowSteps: number[] = [];

    for (const step of this.trace.steps) {
      if ((step.duration || 0) > this.config.longDurationThreshold) {
        slowSteps.push(step.stepNumber);
      }
    }

    if (slowSteps.length > 0) {
      warnings.push({
        type: 'long_duration',
        severity: 'info',
        message: `${slowSteps.length} step(s) took longer than ${this.config.longDurationThreshold}ms`,
        details: {
          threshold: this.config.longDurationThreshold,
          slowStepCount: slowSteps.length,
        },
        stepNumbers: slowSteps,
      });
    }

    return warnings;
  }

  /**
   * Check error rate
   */
  private checkErrorRate(): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];
    const errorSteps = this.trace.steps.filter(s => s.stepType === 'error');
    const errorRate = errorSteps.length / this.trace.steps.length;

    if (errorRate > 0.2) {
      warnings.push({
        type: 'error_rate',
        severity: 'critical',
        message: `High error rate: ${(errorRate * 100).toFixed(1)}%`,
        details: {
          errorCount: errorSteps.length,
          totalSteps: this.trace.steps.length,
          errorRate,
        },
        stepNumbers: errorSteps.map(s => s.stepNumber),
      });
    } else if (errorRate > 0.1) {
      warnings.push({
        type: 'error_rate',
        severity: 'warning',
        message: `Moderate error rate: ${(errorRate * 100).toFixed(1)}%`,
        details: {
          errorCount: errorSteps.length,
          totalSteps: this.trace.steps.length,
          errorRate,
        },
        stepNumbers: errorSteps.map(s => s.stepNumber),
      });
    }

    return warnings;
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(): AnalysisReport['summary'] {
    const startTime = new Date(this.trace.startTime).getTime();
    const endTime = this.trace.endTime ? new Date(this.trace.endTime).getTime() : Date.now();

    // Find peak memory size
    let peakMemorySize = 0;
    for (const step of this.trace.steps) {
      const size = Object.keys(step.stateSnapshot.memory).length;
      if (size > peakMemorySize) {
        peakMemorySize = size;
      }
    }

    return {
      totalSteps: this.trace.steps.length,
      totalDuration: endTime - startTime,
      llmCalls: this.trace.metadata.totalLLMCalls,
      toolCalls: this.trace.metadata.totalToolCalls,
      errors: this.trace.steps.filter(s => s.stepType === 'error').length,
      memoryPeakSize: peakMemorySize,
    };
  }

  /**
   * Generate recommendations based on warnings
   */
  private generateRecommendations(warnings: AnalysisWarning[]): string[] {
    const recommendations: string[] = [];

    for (const warning of warnings) {
      switch (warning.type) {
        case 'high_step_count':
          recommendations.push('Consider breaking down the task into smaller sub-tasks');
          recommendations.push('Review if the agent is getting stuck in loops');
          break;
        case 'memory_growth':
          recommendations.push('Implement memory cleanup or summarization');
          recommendations.push('Check if all stored information is necessary');
          break;
        case 'repeated_tool_calls':
          recommendations.push('Cache tool results to avoid redundant calls');
          recommendations.push('Review agent logic for unnecessary repetition');
          break;
        case 'unused_memory':
          recommendations.push('Remove unused memory storage to reduce overhead');
          break;
        case 'long_duration':
          recommendations.push('Consider caching slow operations');
          recommendations.push('Review LLM prompts for efficiency');
          break;
        case 'error_rate':
          recommendations.push('Implement better error handling and recovery');
          recommendations.push('Review tool implementations for reliability');
          break;
      }
    }

    // Deduplicate
    return [...new Set(recommendations)];
  }
}

/**
 * Quick analysis function
 */
export function analyzeTrace(tracePath: string): AnalysisReport {
  const analyzer = TraceAnalyzer.fromFile(tracePath);
  return analyzer.analyze();
}
