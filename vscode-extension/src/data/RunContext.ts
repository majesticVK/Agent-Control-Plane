import * as vscode from 'vscode';
import { RunLoader } from './RunLoader';
import { RunArtifacts, AgentStep } from './DataTypes';

export class RunContext {
    private static instance: RunContext;
    private _currentRun: RunArtifacts | undefined;
    private _loader: RunLoader | undefined;
    private _currentStepIndex: number = 0;

    private _onDidRunChange = new vscode.EventEmitter<RunArtifacts | undefined>();
    public readonly onDidRunChange = this._onDidRunChange.event;

    private _onDidStepChange = new vscode.EventEmitter<AgentStep>();
    public readonly onDidStepChange = this._onDidStepChange.event;

    private constructor() {}

    public static getInstance(): RunContext {
        if (!RunContext.instance) {
            RunContext.instance = new RunContext();
        }
        return RunContext.instance;
    }

    public async loadRun(runPath: string) {
        try {
            this._loader = new RunLoader(runPath);
            this._currentRun = await this._loader.load();
            this._currentStepIndex = 0;
            this._onDidRunChange.fire(this._currentRun);
            if (this._currentRun.steps.length > 0) {
                this._onDidStepChange.fire(this._currentRun.steps[0]);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load run: ${error}`);
            this._currentRun = undefined;
            this._loader = undefined;
            this._onDidRunChange.fire(undefined);
        }
    }

    public get currentRun(): RunArtifacts | undefined {
        return this._currentRun;
    }

    public get loader(): RunLoader | undefined {
        return this._loader;
    }

    public get currentStep(): AgentStep | undefined {
        if (!this._currentRun || this._currentRun.steps.length === 0) return undefined;
        return this._currentRun.steps[this._currentStepIndex];
    }

    public setStep(index: number) {
        if (!this._currentRun) return;
        if (index < 0 || index >= this._currentRun.steps.length) return;
        
        this._currentStepIndex = index;
        this._onDidStepChange.fire(this._currentRun.steps[index]);
    }
}
