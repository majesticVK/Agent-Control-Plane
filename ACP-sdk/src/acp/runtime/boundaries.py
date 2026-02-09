from contextlib import contextmanager
import functools
import traceback
from typing import Optional, Any, Dict
from ..core.recorder import TraceRecorder

class Context:
    def __init__(self):
        self.memory_snapshot = None

    def update_memory(self, memory: Any):
        self.memory_snapshot = memory

_context = Context()

def get_context():
    return _context

class StepContext:
    """
    Mutable object to allow users to update step output from within the `with` block.
    """
    def __init__(self, phase: str, input_data: Dict[str, Any], handle: Optional[str] = None):
        self.phase = phase
        self.input_data = input_data
        self.output_data = {}
        self.status = "ok"
        self.handle = handle

    def set_output(self, key: str, value: Any):
        self.output_data[key] = value

    def set_status(self, status: str):
        self.status = status

@contextmanager
def step(phase: str, input_data: Dict[str, Any] = None):
    """
    Context manager to define an execution boundary (step).
    Yields a `StepContext` object to allow setting outputs dynamically.
    Uses pending handles to safely isolate IO.
    """
    recorder = TraceRecorder.get_instance()
    
    if not recorder.active:
        if recorder.strict_mode:
             raise RuntimeError("Attempted to record step without an active run.")
        # Return dummy context without handle
        yield StepContext(phase, input_data or {})
        return

    # Create pending handle
    handle = recorder.create_pending_step()
    step_ctx = StepContext(phase, input_data or {}, handle=handle)

    try:
        yield step_ctx
    except Exception as e:
        step_ctx.status = "error"
        step_ctx.output_data["error"] = str(e)
        step_ctx.output_data["traceback"] = traceback.format_exc()
        raise e
    finally:
        # Snapshot state
        snapshot = None
        if _context.memory_snapshot:
            snapshot = {
                "memory": _context.memory_snapshot,
                "context_tokens": 0, 
                "tools_state": {}
            }

        recorder.record_step(
            phase=step_ctx.phase,
            input_data=step_ctx.input_data,
            output_data=step_ctx.output_data,
            status=step_ctx.status,
            state_snapshot=snapshot,
            pending_step_handle=step_ctx.handle
        )

def boundary(phase: str):
    """
    Decorator for functions representing a boundary.
    Automatically captures return value as 'result' in output_data.
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            input_data = {"args": args, "kwargs": kwargs}
            # Use the context manager
            with step(phase, input_data) as ctx:
                result = func(*args, **kwargs)
                # Capture result
                ctx.set_output("result", result)
                return result
        return wrapper
    return decorator
