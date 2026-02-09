import json
import os
import time
import uuid
import dataclasses
import shutil
from typing import Optional, Dict, Any, List
from .types import RunMeta, AgentStep
from .utils import SecretRedactor, TraceLimits

class TraceRecorder:
    _instance = None

    def __init__(self, base_path: str = "traces"):
        self.base_path = base_path
        self.current_run_id: Optional[str] = None
        self.run_dir: Optional[str] = None
        self.step_counter = 0
        self.meta: Optional[RunMeta] = None
        self.active = False
        self.strict_mode = False # If True, raises errors on misuse

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = TraceRecorder()
        return cls._instance

    def set_strict_mode(self, strict: bool):
        self.strict_mode = strict

    def start_run(self, agent_version: str, llm: str, seed: int = 42, tools: List[str] = None):
        if self.active:
            msg = f"Run {self.current_run_id} already active. Stopping it implicitly."
            print(f"[ACP] Warning: {msg}")
            if self.strict_mode:
                raise RuntimeError(msg)
            self.stop_run("restarted")

        self.current_run_id = f"run_{uuid.uuid4()}"
        self.run_dir = os.path.join(self.base_path, self.current_run_id)
        
        # Create directories
        os.makedirs(os.path.join(self.run_dir, "snapshots"), exist_ok=True)
        os.makedirs(os.path.join(self.run_dir, "diffs"), exist_ok=True)
        os.makedirs(os.path.join(self.run_dir, "tools"), exist_ok=True)

        self.meta = RunMeta(
            run_id=self.current_run_id,
            agent_version=agent_version,
            llm=llm,
            created_at=time.time(),
            seed=seed,
            tools=tools or [],
            status="active"
        )
        
        self._write_meta()
        self.step_counter = 0
        self.active = True
        print(f"[ACP] Started run: {self.current_run_id}")

    def create_pending_step(self) -> str:
        """
        Creates a unique handle (UUID) for a pending step. 
        This allows IO to be recorded before the step ID is assigned.
        """
        return str(uuid.uuid4())

    def record_step(self, phase: str, input_data: Dict, output_data: Dict, status: str = "ok", state_snapshot: Any = None, pending_step_handle: Optional[str] = None):
        if not self.active or not self.run_dir:
            if self.strict_mode:
                raise RuntimeError("Attempted to record step without an active run.")
            return

        self.step_counter += 1
        
        # Trace Limit Check
        if self.step_counter > TraceLimits.MAX_STEPS:
            if self.meta and not self.meta.truncated:
                print("[ACP] Trace limit reached, truncating run.")
                self.meta.truncated = True
                self.meta.termination_reason = "limit_exceeded"
                self.stop_run("limit_exceeded")
            return

        safe_input = SecretRedactor.redact_object(input_data)
        safe_output = SecretRedactor.redact_object(output_data)

        # Handle pending IO artifacts (rename UUID -> step_N)
        if pending_step_handle:
            self._commit_pending_io(pending_step_handle, self.step_counter)

        state_ref = None
        if state_snapshot:
            # Simple size check could go here
            snapshot_filename = f"step_{self.step_counter}.json"
            snapshot_path = os.path.join(self.run_dir, "snapshots", snapshot_filename)
            safe_snapshot = SecretRedactor.redact_object(state_snapshot)
            with open(snapshot_path, "w") as f:
                json.dump(safe_snapshot, f, indent=2)
            state_ref = f"snapshots/{snapshot_filename}"

        step = AgentStep(
            step_id=self.step_counter,
            timestamp=time.time(),
            phase=phase,
            input=safe_input,
            output=safe_output,
            status=status,
            state_ref=state_ref
        )

        self._append_step(step)
        
        if self.meta:
            self.meta.step_count = self.step_counter

    def record_tool_io(self, tool_name: str, stdout: str, stderr: str, step_handle: Optional[str] = None):
        """
        Records IO for a tool.
        If step_handle is provided, writes to {handle}.stdout/stderr (pending state).
        If not, falls back to legacy heuristic (step_counter + 1), which is fragile.
        """
        if not self.active or not self.run_dir:
            if self.strict_mode:
                raise RuntimeError("Attempted to record tool IO without an active run.")
            return
        
        # Determine filename base
        if step_handle:
            filename_base = step_handle
        else:
            # Legacy fallback - Warn in strict mode?
            if self.strict_mode:
                 # We allow it for now but it's discouraged
                 pass
            filename_base = f"step_{self.step_counter + 1}"
        
        if stdout:
            with open(os.path.join(self.run_dir, "tools", f"{filename_base}.stdout"), "a") as f:
                f.write(SecretRedactor.redact(stdout))
        if stderr:
            with open(os.path.join(self.run_dir, "tools", f"{filename_base}.stderr"), "a") as f:
                f.write(SecretRedactor.redact(stderr))

    def _commit_pending_io(self, handle: str, step_id: int):
        """
        Renames pending IO files (UUID) to their final step ID names.
        """
        if not self.run_dir:
            return
            
        tools_dir = os.path.join(self.run_dir, "tools")
        
        for ext in [".stdout", ".stderr"]:
            src = os.path.join(tools_dir, f"{handle}{ext}")
            dst = os.path.join(tools_dir, f"step_{step_id}{ext}")
            if os.path.exists(src):
                if os.path.exists(dst):
                    # Append if destination exists (unlikely given step ID uniqueness, but safe)
                    with open(src, 'r') as f_src, open(dst, 'a') as f_dst:
                        shutil.copyfileobj(f_src, f_dst)
                    os.remove(src)
                else:
                    os.rename(src, dst)

    def _write_meta(self):
        if not self.run_dir or not self.meta:
            return
        with open(os.path.join(self.run_dir, "meta.json"), "w") as f:
            json.dump(dataclasses.asdict(self.meta), f, indent=2)

    def _append_step(self, step: AgentStep):
        if not self.run_dir:
            return
        with open(os.path.join(self.run_dir, "steps.jsonl"), "a") as f:
            f.write(json.dumps(dataclasses.asdict(step)) + "\n")

    def stop_run(self, reason: str = "success"):
        if not self.active:
            if self.strict_mode:
                raise RuntimeError("Attempted to stop an inactive run.")
            return
            
        self.active = False
        if self.meta:
            self.meta.status = "stopped" if reason == "stopped" else ("failure" if reason == "error" else "success")
            if reason != "success" and not self.meta.termination_reason:
                self.meta.termination_reason = reason
            self._write_meta()
            
        print(f"[ACP] Stopped run: {self.current_run_id} ({reason})")
