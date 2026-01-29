/**
 * Agent Control Plane - Demo Replay
 * 
 * Replays a trace to verify deterministic behavior.
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { ReplayEngine } from '../core/replay-engine';
import { TraceRecorder } from '../core/trace-recorder';

const DIVIDER = '─'.repeat(60);

async function replayDemo(tracePath?: string): Promise<void> {
    console.log(chalk.cyan.bold(`\n${DIVIDER}`));
    console.log(chalk.cyan.bold(` AGENT CONTROL PLANE - REPLAY`));
    console.log(chalk.cyan.bold(DIVIDER));
    console.log();

    // Find trace file
    if (!tracePath) {
        const traces = TraceRecorder.listTraces('./traces');
        if (traces.length === 0) {
            console.log(chalk.red('No traces found. Run the demo first: npm run demo'));
            return;
        }
        // Use the most recent trace
        tracePath = traces[traces.length - 1];
    }

    if (!fs.existsSync(tracePath)) {
        // Try relative path
        const relativePath = path.join('./traces', tracePath);
        if (fs.existsSync(relativePath)) {
            tracePath = relativePath;
        } else if (fs.existsSync(relativePath + '.json')) {
            tracePath = relativePath + '.json';
        } else {
            console.log(chalk.red(`Trace file not found: ${tracePath}`));
            return;
        }
    }

    console.log(chalk.gray(`Replaying: ${tracePath}`));
    console.log();

    // Load and replay
    const result = await ReplayEngine.replayFromFile(tracePath);

    console.log(chalk.cyan('Replay Results:'));
    console.log();
    console.log(`  Original Trace ID: ${result.originalTrace.traceId}`);
    console.log(`  Replay Trace ID:   ${result.replayTrace.traceId}`);
    console.log();
    console.log(`  Original Steps: ${result.stepCount.original}`);
    console.log(`  Replay Steps:   ${result.stepCount.replay}`);
    console.log(`  Steps Match:    ${result.stepCount.match ? chalk.green('Yes') : chalk.red('No')}`);
    console.log();
    console.log(`  State Match: ${result.stateMatch ? chalk.green('Yes') : chalk.red('No')}`);
    console.log();

    if (result.divergences.length > 0) {
        console.log(chalk.yellow('Divergences:'));
        for (const div of result.divergences) {
            console.log(`  Step ${div.stepNumber}: ${div.type}`);
            console.log(chalk.gray(`    ${div.message}`));
        }
    } else {
        console.log(chalk.green('✓ No divergences - replay is deterministic!'));
    }

    console.log();

    // Final result
    console.log(chalk.cyan.bold(DIVIDER));
    if (result.success && result.stateMatch && result.stepCount.match) {
        console.log(chalk.green.bold(' ✓ REPLAY SUCCESSFUL - Execution is deterministic'));
    } else {
        console.log(chalk.red.bold(' ✗ REPLAY FAILED - Divergences detected'));
    }
    console.log(chalk.cyan.bold(DIVIDER));
    console.log();
}

// Parse command line args
const args = process.argv.slice(2);
replayDemo(args[0]).catch(console.error);
