/**
 * Agent Control Plane - Demo Runner
 * 
 * Runs the demo agent and generates a trace.
 */

import chalk from 'chalk';
import { AgentRuntime, AgentConfig } from '../core/agent-runtime';
import { createMockLLMProvider, ScenarioType } from './mock-llm';
import { getDemoTools } from './mock-tools';

const DIVIDER = '─'.repeat(60);

async function runDemo(scenario: ScenarioType = 'restaurant'): Promise<void> {
    console.log(chalk.cyan.bold(`\n${DIVIDER}`));
    console.log(chalk.cyan.bold(` AGENT CONTROL PLANE - DEMO`));
    console.log(chalk.cyan.bold(DIVIDER));
    console.log();

    console.log(chalk.gray(`Scenario: ${scenario}`));
    console.log();

    // Create agent configuration
    const config: AgentConfig = {
        agentId: 'demo-restaurant-agent',
        maxSteps: 10,
        llmProvider: createMockLLMProvider(scenario),
        tools: getDemoTools(),
        systemPrompt: 'You are a helpful restaurant booking assistant.',
        outputDir: './traces',
        onStepComplete: (step, state) => {
            console.log(chalk.yellow(`  Step ${step}: ${state.status}`));
        },
    };

    // Create agent runtime
    const agent = new AgentRuntime(config);

    console.log(chalk.cyan('Starting agent...'));
    console.log();

    // Run the agent
    const taskId = `task_${Date.now()}`;
    const goal = scenario === 'broken'
        ? 'Book a restaurant but get stuck in a loop'
        : 'Book a table for 2 at an Italian restaurant downtown for tonight at 7 PM';

    console.log(chalk.white(`Goal: ${goal}`));
    console.log();

    const result = await agent.run(taskId, goal);

    console.log();
    console.log(chalk.cyan.bold(DIVIDER));
    console.log(chalk.cyan.bold(` RESULT`));
    console.log(chalk.cyan.bold(DIVIDER));

    console.log();
    console.log(`  Success: ${result.success ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(`  Steps: ${result.trace.steps.length}`);
    console.log(`  LLM Calls: ${result.trace.metadata.totalLLMCalls}`);
    console.log(`  Tool Calls: ${result.trace.metadata.totalToolCalls}`);
    console.log(`  Tools Used: ${result.trace.metadata.toolsUsed.join(', ')}`);
    console.log(`  Status: ${result.finalState.status}`);
    console.log();
    console.log(chalk.green(`  Trace saved: ${result.traceFile}`));
    console.log();

    // Show next steps
    console.log(chalk.cyan.bold(DIVIDER));
    console.log(chalk.cyan.bold(` NEXT STEPS`));
    console.log(chalk.cyan.bold(DIVIDER));
    console.log();
    console.log(chalk.gray('  Inspect the trace:'));
    console.log(chalk.white(`    npm run inspect ${result.traceFile}`));
    console.log();
    console.log(chalk.gray('  Run tests:'));
    console.log(chalk.white(`    npm run test ${result.traceFile}`));
    console.log();
    console.log(chalk.gray('  Analyze for issues:'));
    console.log(chalk.white(`    npm run analyze ${result.traceFile}`));
    console.log();
    console.log(chalk.gray('  Replay the trace:'));
    console.log(chalk.white(`    npm run demo:replay ${result.traceFile}`));
    console.log();
}

// Parse command line args
const args = process.argv.slice(2);
const scenario = args.includes('--broken') ? 'broken' : 'restaurant';

runDemo(scenario).catch(console.error);
