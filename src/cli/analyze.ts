/**
 * Agent Control Plane - CLI Analyzer
 * 
 * Analyzes traces for inefficiencies and issues.
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { TraceAnalyzer, AnalysisReport, AnalysisWarning } from '../core/analyzer';
import { TraceRecorder } from '../core/trace-recorder';

const DIVIDER = '─'.repeat(60);

/**
 * Get color for severity
 */
function getSeverityColor(severity: AnalysisWarning['severity']): chalk.Chalk {
  switch (severity) {
    case 'critical':
      return chalk.red;
    case 'warning':
      return chalk.yellow;
    case 'info':
      return chalk.blue;
    default:
      return chalk.white;
  }
}

/**
 * Get icon for severity
 */
function getSeverityIcon(severity: AnalysisWarning['severity']): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'warning':
      return '🟡';
    case 'info':
      return '🔵';
    default:
      return '⚪';
  }
}

/**
 * Display analysis report
 */
function displayReport(report: AnalysisReport): void {
  console.log(chalk.cyan.bold(`\n${DIVIDER}`));
  console.log(chalk.cyan.bold(` TRACE ANALYSIS REPORT`));
  console.log(chalk.cyan.bold(DIVIDER));

  // Summary
  console.log(chalk.yellow('\n▸ Summary'));
  console.log(`  Total Steps:    ${report.summary.totalSteps}`);
  console.log(`  Duration:       ${report.summary.totalDuration}ms`);
  console.log(`  LLM Calls:      ${report.summary.llmCalls}`);
  console.log(`  Tool Calls:     ${report.summary.toolCalls}`);
  console.log(`  Errors:         ${report.summary.errors}`);
  console.log(`  Peak Memory:    ${report.summary.memoryPeakSize} keys`);

  // Warnings
  if (report.warnings.length > 0) {
    console.log(chalk.yellow('\n▸ Warnings & Issues'));
    
    for (const warning of report.warnings) {
      const color = getSeverityColor(warning.severity);
      const icon = getSeverityIcon(warning.severity);
      
      console.log();
      console.log(`  ${icon} ${color(warning.severity.toUpperCase())}: ${warning.message}`);
      
      // Show details
      for (const [key, value] of Object.entries(warning.details)) {
        console.log(chalk.gray(`     ${key}: ${JSON.stringify(value)}`));
      }
      
      // Show affected steps
      if (warning.stepNumbers && warning.stepNumbers.length > 0) {
        console.log(chalk.gray(`     Steps: ${warning.stepNumbers.join(', ')}`));
      }
    }
  } else {
    console.log(chalk.green('\n▸ No warnings found! 🎉'));
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log(chalk.yellow('\n▸ Recommendations'));
    for (const rec of report.recommendations) {
      console.log(`  • ${rec}`);
    }
  }

  console.log(chalk.cyan.bold(`\n${DIVIDER}\n`));
}

/**
 * Analyze a trace file
 */
async function analyzeTrace(tracePath: string): Promise<void> {
  if (!fs.existsSync(tracePath)) {
    console.log(chalk.red(`Trace file not found: ${tracePath}`));
    return;
  }

  console.log(chalk.gray(`Analyzing: ${tracePath}`));
  
  const analyzer = TraceAnalyzer.fromFile(tracePath);
  const report = analyzer.analyze();
  
  displayReport(report);
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(chalk.cyan.bold('\nAgent Control Plane - Trace Analyzer'));
    console.log(chalk.gray('\nUsage:'));
    console.log(chalk.gray('  npm run analyze <trace-file>'));
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

  // Handle relative paths
  if (!fs.existsSync(tracePath)) {
    tracePath = path.join('./traces', tracePath);
    if (!tracePath.endsWith('.json')) {
      tracePath += '.json';
    }
  }

  await analyzeTrace(tracePath);
}

main().catch(console.error);
