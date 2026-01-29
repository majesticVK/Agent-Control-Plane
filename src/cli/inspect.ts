/**
 * Agent Control Plane - CLI Step Inspector
 * 
 * Interactive CLI for inspecting trace steps.
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { StepInspector } from '../core/step-inspector';
import { TraceRecorder } from '../core/trace-recorder';

const DIVIDER = '─'.repeat(60);

export function printHeader(text: string): void {
    console.log(chalk.cyan.bold(`\n${DIVIDER}`));
    console.log(chalk.cyan.bold(` ${text}`));
    console.log(chalk.cyan.bold(DIVIDER));
}

export function printSubheader(text: string): void {
    console.log(chalk.yellow(`\n▸ ${text}`));
}

export function printKeyValue(key: string, value: unknown): void {
    console.log(`  ${chalk.gray(key)}: ${chalk.white(String(value))}`);
}

export function printJSON(obj: unknown, indent = 2): void {
    const lines = JSON.stringify(obj, null, 2).split('\n');
    for (const line of lines) {
        console.log(`${'  '.repeat(indent)}${chalk.gray(line)}`);
    }
}

/**
 * Display trace overview
 */
export function displayOverview(inspector: StepInspector): void {
    const overview = inspector.getOverview();

    printHeader('TRACE OVERVIEW');

    printKeyValue('Trace ID', overview.traceId);
    printKeyValue('Agent ID', overview.agentId);
    printKeyValue('Task ID', overview.taskId);
    printKeyValue('Status', overview.status === 'completed'
        ? chalk.green(overview.status)
        : chalk.red(overview.status));
    printKeyValue('Duration', overview.duration);
    printKeyValue('Total Steps', overview.stepCount);
    printKeyValue('LLM Calls', overview.llmCalls);
    printKeyValue('Tool Calls', overview.toolCalls);
    printKeyValue('Errors', overview.errors > 0
        ? chalk.red(overview.errors)
        : chalk.green(overview.errors));
    printKeyValue('Tools Used', overview.toolsUsed.join(', ') || 'None');

    printSubheader('Step Summary');
    console.log();

    for (const step of overview.stepSummaries) {
        const stepNum = chalk.cyan(`[${String(step.stepNumber).padStart(2, '0')}]`);
        const stepType = chalk.yellow(`[${step.stepType.toUpperCase().padEnd(8)}]`);
        const hasError = step.hasError ? chalk.red(' ⚠') : '';
        console.log(`  ${stepNum} ${stepType} ${step.summary}${hasError}`);
    }
}

/**
 * Display single step details
 */
export function displayStep(inspector: StepInspector, stepNumber: number): void {
    const step = inspector.inspectStep(stepNumber);

    if (!step) {
        console.log(chalk.red(`Step ${stepNumber} not found`));
        return;
    }

    printHeader(`STEP ${step.stepNumber} - ${step.stepType.toUpperCase()}`);

    printKeyValue('Timestamp', step.timestamp);
    printKeyValue('Duration', `${step.duration}ms`);

    printSubheader('INPUT');
    console.log(chalk.gray(`  Summary: ${step.input.summary}`));
    printJSON(step.input.raw);

    printSubheader('OUTPUT');
    console.log(chalk.gray(`  Summary: ${step.output.summary}`));
    printJSON(step.output.raw);

    printSubheader('STATE SNAPSHOT');
    if (step.state.changes && step.state.changes.length > 0) {
        console.log(chalk.green('  Changes from previous step:'));
        for (const change of step.state.changes) {
            console.log(chalk.green(`    • ${change}`));
        }
    }
    printJSON(step.state.raw);

    if (step.metadata) {
        printSubheader('METADATA');
        printJSON(step.metadata);
    }

    // Navigation hint
    console.log();
    const nav: string[] = [];
    if (step.navigation.hasPrevious) {
        nav.push(`Previous: ${step.navigation.previousStep}`);
    }
    if (step.navigation.hasNext) {
        nav.push(`Next: ${step.navigation.nextStep}`);
    }
    console.log(chalk.gray(`Navigation: ${nav.join(' | ')}`));
}

/**
 * Interactive inspection mode
 */
export async function interactiveInspect(tracePath: string): Promise<void> {
    const inspector = StepInspector.fromFile(tracePath);
    const overview = inspector.getOverview();

    console.clear();
    displayOverview(inspector);

    console.log(chalk.cyan('\n\nCommands:'));
    console.log(chalk.gray('  [number]  - Inspect step by number'));
    console.log(chalk.gray('  o         - Show overview'));
    console.log(chalk.gray('  q         - Quit'));
    console.log();

    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const prompt = (): void => {
        rl.question(chalk.cyan('acp> '), (answer) => {
            const cmd = answer.trim().toLowerCase();

            if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
                rl.close();
                return;
            }

            if (cmd === 'o' || cmd === 'overview') {
                console.clear();
                displayOverview(inspector);
            } else {
                const stepNum = parseInt(cmd, 10);
                if (!isNaN(stepNum) && stepNum >= 1 && stepNum <= overview.stepCount) {
                    console.clear();
                    displayStep(inspector, stepNum);
                } else {
                    console.log(chalk.red(`Invalid command or step number. Valid steps: 1-${overview.stepCount}`));
                }
            }

            prompt();
        });
    };

    prompt();
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        // List available traces
        const traces = TraceRecorder.listTraces('./traces');

        if (traces.length === 0) {
            console.log(chalk.yellow('No traces found in ./traces'));
            console.log(chalk.gray('Run a demo first: npm run demo'));
            return;
        }

        console.log(chalk.cyan.bold('\nAvailable Traces:'));
        for (const trace of traces) {
            console.log(chalk.gray(`  ${path.basename(trace)}`));
        }
        console.log(chalk.gray('\nUsage: npm run inspect <trace-file>'));
        return;
    }

    let tracePath = args[0];

    // Check if it's a relative path
    if (!fs.existsSync(tracePath)) {
        tracePath = path.join('./traces', tracePath);
    }

    if (!tracePath.endsWith('.json')) {
        tracePath += '.json';
    }

    if (!fs.existsSync(tracePath)) {
        console.log(chalk.red(`Trace file not found: ${tracePath}`));
        return;
    }

    const stepArg = args[1];
    const inspector = StepInspector.fromFile(tracePath);

    if (stepArg) {
        const stepNum = parseInt(stepArg, 10);
        if (!isNaN(stepNum)) {
            displayStep(inspector, stepNum);
        } else {
            console.log(chalk.red('Invalid step number'));
        }
    } else {
        // Interactive mode
        await interactiveInspect(tracePath);
    }
}

main().catch(console.error);
