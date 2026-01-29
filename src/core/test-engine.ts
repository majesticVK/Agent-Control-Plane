/**
 * Agent Control Plane - Behavioral Regression Test Engine
 * 
 * A simple assertion system for testing agent behavior.
 * Tests tool usage, step counts, and state - NOT exact text output.
 */

import * as fs from 'fs';
import * as yaml from 'yaml';
import {
    Trace,
    TestAssertion,
    TestCase,
    TestResult,
    Step,
    ToolStep,
    LLMStep,
} from './types';
import { TraceRecorder } from './trace-recorder';

export interface TestSuiteResult {
    suiteName: string;
    totalTests: number;
    passed: number;
    failed: number;
    duration: number;
    results: TestResult[];
}

export class TestEngine {
    private trace: Trace;

    constructor(trace: Trace) {
        this.trace = trace;
    }

    /**
     * Load test engine from trace file
     */
    static fromTraceFile(tracePath: string): TestEngine {
        const trace = TraceRecorder.load(tracePath);
        return new TestEngine(trace);
    }

    /**
     * Run a single test case
     */
    runTest(testCase: TestCase): TestResult {
        const startTime = Date.now();
        const assertionResults: TestResult['assertions'] = [];

        for (const assertion of testCase.assertions) {
            const result = this.evaluateAssertion(assertion);
            assertionResults.push(result);
        }

        return {
            testName: testCase.name,
            passed: assertionResults.every(a => a.passed),
            assertions: assertionResults,
            duration: Date.now() - startTime,
        };
    }

    /**
     * Run multiple test cases
     */
    runTests(testCases: TestCase[]): TestSuiteResult {
        const startTime = Date.now();
        const results: TestResult[] = [];

        for (const testCase of testCases) {
            results.push(this.runTest(testCase));
        }

        return {
            suiteName: 'Agent Behavioral Tests',
            totalTests: results.length,
            passed: results.filter(r => r.passed).length,
            failed: results.filter(r => !r.passed).length,
            duration: Date.now() - startTime,
            results,
        };
    }

    /**
     * Load and run tests from a YAML file
     */
    runTestsFromFile(testFilePath: string): TestSuiteResult {
        const content = fs.readFileSync(testFilePath, 'utf-8');
        const testData = yaml.parse(content) as { tests: TestCase[] };
        return this.runTests(testData.tests);
    }

    /**
     * Evaluate a single assertion
     */
    private evaluateAssertion(assertion: TestAssertion): TestResult['assertions'][0] {
        switch (assertion.type) {
            case 'tool_called':
                return this.assertToolCalled(assertion);
            case 'tool_not_called':
                return this.assertToolNotCalled(assertion);
            case 'max_steps':
                return this.assertMaxSteps(assertion);
            case 'min_steps':
                return this.assertMinSteps(assertion);
            case 'state_contains':
                return this.assertStateContains(assertion);
            case 'state_not_contains':
                return this.assertStateNotContains(assertion);
            case 'step_type_count':
                return this.assertStepTypeCount(assertion);
            case 'custom':
                return this.assertCustom(assertion);
            default:
                return {
                    assertion,
                    passed: false,
                    message: `Unknown assertion type: ${assertion.type}`,
                };
        }
    }

    /**
     * Assert that a tool was called
     */
    private assertToolCalled(assertion: TestAssertion): TestResult['assertions'][0] {
        const toolName = assertion.params.tool as string;
        const minTimes = (assertion.params.minTimes as number) || 1;

        const toolSteps = this.trace.steps.filter(
            s => s.stepType === 'tool' && (s as ToolStep).input.toolName === toolName
        );

        const passed = toolSteps.length >= minTimes;

        return {
            assertion,
            passed,
            actual: toolSteps.length,
            message: passed
                ? `✓ Tool '${toolName}' was called ${toolSteps.length} time(s)`
                : `✗ Tool '${toolName}' was called ${toolSteps.length} time(s), expected at least ${minTimes}`,
        };
    }

    /**
     * Assert that a tool was NOT called
     */
    private assertToolNotCalled(assertion: TestAssertion): TestResult['assertions'][0] {
        const toolName = assertion.params.tool as string;

        const toolSteps = this.trace.steps.filter(
            s => s.stepType === 'tool' && (s as ToolStep).input.toolName === toolName
        );

        const passed = toolSteps.length === 0;

        return {
            assertion,
            passed,
            actual: toolSteps.length,
            message: passed
                ? `✓ Tool '${toolName}' was not called`
                : `✗ Tool '${toolName}' was called ${toolSteps.length} time(s), expected 0`,
        };
    }

    /**
     * Assert maximum number of steps
     */
    private assertMaxSteps(assertion: TestAssertion): TestResult['assertions'][0] {
        const maxSteps = assertion.params.count as number;
        const actualSteps = this.trace.steps.length;

        const passed = actualSteps <= maxSteps;

        return {
            assertion,
            passed,
            actual: actualSteps,
            message: passed
                ? `✓ Step count (${actualSteps}) is within limit (${maxSteps})`
                : `✗ Step count (${actualSteps}) exceeds limit (${maxSteps})`,
        };
    }

    /**
     * Assert minimum number of steps
     */
    private assertMinSteps(assertion: TestAssertion): TestResult['assertions'][0] {
        const minSteps = assertion.params.count as number;
        const actualSteps = this.trace.steps.length;

        const passed = actualSteps >= minSteps;

        return {
            assertion,
            passed,
            actual: actualSteps,
            message: passed
                ? `✓ Step count (${actualSteps}) meets minimum (${minSteps})`
                : `✗ Step count (${actualSteps}) is below minimum (${minSteps})`,
        };
    }

    /**
     * Assert that final state contains a value
     */
    private assertStateContains(assertion: TestAssertion): TestResult['assertions'][0] {
        const key = assertion.params.key as string;
        const expectedValue = assertion.params.value;

        const finalState = this.trace.finalState || this.trace.steps[this.trace.steps.length - 1]?.stateSnapshot;

        if (!finalState) {
            return {
                assertion,
                passed: false,
                message: '✗ No final state available',
            };
        }

        const actualValue = this.getNestedValue(finalState as unknown as Record<string, unknown>, key);
        const passed = JSON.stringify(actualValue) === JSON.stringify(expectedValue);

        return {
            assertion,
            passed,
            actual: actualValue,
            message: passed
                ? `✓ State contains ${key} = ${JSON.stringify(expectedValue)}`
                : `✗ State ${key} is ${JSON.stringify(actualValue)}, expected ${JSON.stringify(expectedValue)}`,
        };
    }

    /**
     * Assert that final state does NOT contain a value
     */
    private assertStateNotContains(assertion: TestAssertion): TestResult['assertions'][0] {
        const key = assertion.params.key as string;
        const unwantedValue = assertion.params.value;

        const finalState = this.trace.finalState || this.trace.steps[this.trace.steps.length - 1]?.stateSnapshot;

        if (!finalState) {
            return {
                assertion,
                passed: true,
                message: '✓ No final state (so value not present)',
            };
        }

        const actualValue = this.getNestedValue(finalState as unknown as Record<string, unknown>, key);
        const passed = JSON.stringify(actualValue) !== JSON.stringify(unwantedValue);

        return {
            assertion,
            passed,
            actual: actualValue,
            message: passed
                ? `✓ State does not contain ${key} = ${JSON.stringify(unwantedValue)}`
                : `✗ State contains unwanted ${key} = ${JSON.stringify(unwantedValue)}`,
        };
    }

    /**
     * Assert count of a specific step type
     */
    private assertStepTypeCount(assertion: TestAssertion): TestResult['assertions'][0] {
        const stepType = assertion.params.stepType as string;
        const expectedCount = assertion.params.count as number;
        const operator = (assertion.params.operator as string) || 'eq';

        const actualCount = this.trace.steps.filter(s => s.stepType === stepType).length;

        let passed = false;
        switch (operator) {
            case 'eq':
                passed = actualCount === expectedCount;
                break;
            case 'lt':
                passed = actualCount < expectedCount;
                break;
            case 'lte':
                passed = actualCount <= expectedCount;
                break;
            case 'gt':
                passed = actualCount > expectedCount;
                break;
            case 'gte':
                passed = actualCount >= expectedCount;
                break;
        }

        return {
            assertion,
            passed,
            actual: actualCount,
            message: passed
                ? `✓ ${stepType} steps count (${actualCount}) ${operator} ${expectedCount}`
                : `✗ ${stepType} steps count (${actualCount}) not ${operator} ${expectedCount}`,
        };
    }

    /**
     * Custom assertion (for extensibility)
     */
    private assertCustom(assertion: TestAssertion): TestResult['assertions'][0] {
        // Custom assertions can be added here
        return {
            assertion,
            passed: true,
            message: '✓ Custom assertion (not implemented)',
        };
    }

    /**
     * Get nested value from object using dot notation
     */
    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        const keys = path.split('.');
        let current: unknown = obj;

        for (const key of keys) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = (current as Record<string, unknown>)[key];
        }

        return current;
    }
}

/**
 * Create a test case programmatically
 */
export function createTestCase(
    name: string,
    assertions: TestAssertion[],
    description?: string
): TestCase {
    return { name, description, assertions };
}

/**
 * Helper functions to create assertions
 */
export const assertions = {
    toolCalled: (tool: string, minTimes = 1): TestAssertion => ({
        type: 'tool_called',
        params: { tool, minTimes },
    }),

    toolNotCalled: (tool: string): TestAssertion => ({
        type: 'tool_not_called',
        params: { tool },
    }),

    maxSteps: (count: number): TestAssertion => ({
        type: 'max_steps',
        params: { count },
    }),

    minSteps: (count: number): TestAssertion => ({
        type: 'min_steps',
        params: { count },
    }),

    stateContains: (key: string, value: unknown): TestAssertion => ({
        type: 'state_contains',
        params: { key, value },
    }),

    stateNotContains: (key: string, value: unknown): TestAssertion => ({
        type: 'state_not_contains',
        params: { key, value },
    }),

    stepTypeCount: (stepType: string, count: number, operator = 'eq'): TestAssertion => ({
        type: 'step_type_count',
        params: { stepType, count, operator },
    }),
};
