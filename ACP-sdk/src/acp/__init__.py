from .core.recorder import TraceRecorder
from .runtime.boundaries import step, get_context
from .integrations.interceptors import tool, llm_wrapper, retry_block

def init(agent_version: str = "0.0.1", llm: str = "unknown", seed: int = 42, tools: list = None):
    """
    Initialize the ACP SDK and start a new run.
    """
    recorder = TraceRecorder.get_instance()
    recorder.start_run(agent_version, llm, seed, tools)

def stop(reason: str = "success"):
    """
    Stop the current run.
    """
    TraceRecorder.get_instance().stop_run(reason)

def update_memory(memory_state: any):
    """
    Update the current memory snapshot.
    """
    get_context().update_memory(memory_state)
