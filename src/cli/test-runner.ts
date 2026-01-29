/**
 * Agent Control Plane - CLI Test Runner
 * 
 * Runs behavioral regression tests against traces.
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { TestEngine, TestSuiteResult } from '../core/test-engine';
import { TestResult } from '../core/types';
import { TraceRecorder } from '../core/trace-recorder';

const DIVIDER = '─'.repeat(60);

/**
 * Display test results
 */
function displayResults(results: TestSuiteResult): void {
    console.log(chalk.cyan.bold(`\n${DIVIDER}`));
    console.log(chalk.cyan.bold(` TEST RESULTS`));
    console.log(chalk.cyan.bold(DIVIDER));

    console.log();
    console.log(`  Total:  ${results.totalTests}`);
    console.log(`  Passed: ${chalk.green(results.passed)}`);
    console.log(`  Failed: ${results.failed > 0 ? chalk.red(results.failed) : chalk.green(results.failed)}`);
    console.log(`  Duration: ${results.duration}ms`);
    console.log();

    for (const result of results.results) {
        displayTestResult(result);
    }

    // Summary line
    console.log(chalk.cyan.bold(DIVIDER));
    if (results.failed === 0) {
        console.log(chalk.green.bold(' ✓ All tests passed!'));
    } else {
        console.log(chalk.red.bold(` ✗ ${results.failed} test(s) failed`));
    }
    console.log();
}

/**
 * Display single test result
 */
function displayTestResult(result: TestResult): void {
    const statusIcon = result.passed ? chalk.green('✓') : chalk.red('✗');
    const statusColor = result.passed ? chalk.green : chalk.red;

    console.log(`${statusIcon} ${statusColor(result.testName)} (${result.duration}ms)`);

    for (const assertion of result.assertions) {
        const assertIcon = assertion.passed ? chalk.green('  ✓') : chalk.red('  ✗');
        console.log(`${assertIcon} ${assertion.message}`);
    }
    console.log();
}

/**
 * Run tests from a test file against a trace
 */
async function runTests(tracePath: string, testPath?: string): Promise<void> {
    if (!fs.existsSync(tracePath)) {
        console.log(chalk.red(`Trace file not found: ${tracePath}`));
        return;
    }

    const engine = TestEngine.fromTraceFile(tracePath);

    if (testPath && fs.existsSync(testPath)) {
        // Run tests from file
        console.log(chalk.gray(`Running tests from: ${testPath}`));
        const results = engine.runTestsFromFile(testPath);
        displayResults(results);
    } else {
        // Run default built-in tests
        console.log(chalk.gray('Running built-in tests...'));

        const defaultTests = [
            {
                name: 'Agent should complete within reasonable steps',
                assertions: [
                    { type: 'max_steps' as const, params: { count: 20 } },
                ],
            },
            {
                name: 'Agent should have minimal errors',
                assertions: [
                    { type: 'step_type_count' as const, params: { stepType: 'error', count: 3, operator: 'lte' } },
                ],
            },
            {
                name: 'Agent should use at least one tool',
                assertions: [
                    { type: 'step_type_count' as const, params: { stepType: 'tool', count: 1, operator: 'gte' } },
                ],
            },
        ];

        const results = engine.runTests(defaultTests);
        displayResults(results);
    }
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(chalk.cyan.bold('\nAgent Control Plane - Test Runner'));
        console.log(chalk.gray('\nUsage:'));
        console.log(chalk.gray('  npm run test <trace-file> [test-file.yaml]'));
        console.log();
        console.log(chalk.gray('Examples:'));
        console.log(chalk.gray('  npm run test traces/trace_12345.json'));
        console.log(chalk.gray('  npm run test traces/trace_12345.json tests/basic.yaml'));
        console.log();

        // Show available traces
        const traces = TraceRecorder.listTraces('./traces');
        if (traces.length > 0) {
            console.log(chalk.cyan('Available traces:'));
            for (const trace of traces.slice(0, 5)) {
                console.log(chalk.gray(`  ${path.basename(trace)}`));
            }
            if (traces.length > 5) {
                console.log(chalk.gray(`  ... and ${traces.length - 5} more`));
            }
        }
        return;
    }

    let tracePath = args[0];
    const testPath = args[1];

    // Handle relative paths
    if (!fs.existsSync(tracePath)) {
        tracePath = path.join('./traces', tracePath);
        if (!tracePath.endsWith('.json')) {
            tracePath += '.json';
        }
    }

    await runTests(tracePath, testPath);
}

main().catch(console.error);
