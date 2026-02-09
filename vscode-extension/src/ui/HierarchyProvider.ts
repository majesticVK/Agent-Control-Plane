import * as vscode from 'vscode';
import { RunContext } from '../data/RunContext';
import { AgentStep } from '../data/DataTypes';

type GroupingMode = 'phase' | 'tool' | 'retry' | 'none';

export class HierarchyProvider implements vscode.TreeDataProvider<HierarchyItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<HierarchyItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private grouping: GroupingMode = 'phase';

    constructor() {
        RunContext.getInstance().onDidRunChange(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    setGrouping(mode: GroupingMode) {
        this.grouping = mode;
        this.refresh();
    }

    getTreeItem(element: HierarchyItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HierarchyItem): HierarchyItem[] {
        const run = RunContext.getInstance().currentRun;
        if (!run) return [];

        if (element) {
            // Children of a group
            return element.steps.map(step => new HierarchyItem(step, undefined));
        }

        // Root groups
        if (this.grouping === 'phase') {
            const groups = new Map<string, AgentStep[]>();
            run.steps.forEach(step => {
                const phase = step.phase;
                if (!groups.has(phase)) groups.set(phase, []);
                groups.get(phase)!.push(step);
            });
            return Array.from(groups.entries()).map(([key, steps]) => 
                new HierarchyItem(key, steps)
            );
        } else if (this.grouping === 'retry') {
             // Basic retry grouping (consecutive retries)
             // Implementation: if step status is retry, group it. 
             // Simpler: Just group by status for now.
             const groups = new Map<string, AgentStep[]>();
             run.steps.forEach(step => {
                 const key = step.status;
                 if (!groups.has(key)) groups.set(key, []);
                 groups.get(key)!.push(step);
             });
             return Array.from(groups.entries()).map(([key, steps]) => 
                 new HierarchyItem(key, steps)
             );
        }
        
        // Default: flat list
        return run.steps.map(step => new HierarchyItem(step, undefined));
    }
}

class HierarchyItem extends vscode.TreeItem {
    public steps: AgentStep[];

    constructor(info: string | AgentStep, children?: AgentStep[]) {
        if (typeof info === 'string') {
            // It's a group
            super(info, vscode.TreeItemCollapsibleState.Collapsed);
            this.steps = children || [];
            this.description = `(${this.steps.length})`;
            this.contextValue = 'group';
        } else {
            // It's a step
            super(`Step ${info.step_id}`, vscode.TreeItemCollapsibleState.None);
            this.steps = [];
            this.description = info.phase;
            this.command = {
                command: 'acp.jumpToStep',
                title: 'Jump to Step',
                arguments: [info.step_id]
            };
            
            const icon = info.status === 'error' ? 'error' : 
                         info.status === 'retry' ? 'warning' : 'circle-outline';
            this.iconPath = new vscode.ThemeIcon(icon);
        }
    }
}
