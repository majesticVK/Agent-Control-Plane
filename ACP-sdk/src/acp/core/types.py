from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List
import time

@dataclass
class RunMeta:
    run_id: str
    agent_version: str
    llm: str
    created_at: float
    tools: List[str] = field(default_factory=list)
    seed: Optional[int] = None
    temperature: float = 0.0
    status: str = "active" # active, success, failure, stopped, exhausted
    termination_reason: Optional[str] = None
    step_count: int = 0
    truncated: bool = False

@dataclass
class AgentStep:
    step_id: int
    timestamp: float
    phase: str  # reason, tool, observe, memory, retry, terminate
    input: Dict[str, Any]
    output: Dict[str, Any]
    status: str = "ok"  # ok, error, retry
    state_ref: Optional[str] = None
    diff_ref: Optional[str] = None
