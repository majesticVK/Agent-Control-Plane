import functools
import time
from ..core.recorder import TraceRecorder
from ..runtime.boundaries import step

def tool(name: str = None, retry_policy: int = 0):
    """
    Decorator to instrument a tool function.
    Automatically captures retries if retry_policy > 0.
    Uses pending handles for IO isolation.
    """
    def decorator(func):
        tool_name = name or func.__name__
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            input_data = {"toolName": tool_name, "args": args, "kwargs": kwargs}
            recorder = TraceRecorder.get_instance()
            
            # Simple automatic retry loop if configured
            max_attempts = 1 + max(0, retry_policy)
            attempts = 0
            last_error = None
            
            while attempts < max_attempts:
                attempts += 1
                
                # Create a pending handle for THIS attempt
                handle = recorder.create_pending_step()
                
                try:
                    # Capture start time for duration
                    start_ts = time.time()
                    
                    # NOTE: How do we ensure user's print() calls go to this handle?
                    # We can't easily without redirecting sys.stdout.
                    # But if the user calls recorder.record_tool_io explicitly, they need the handle.
                    # For now, we assume the decorator handles the IO capture via return value.
                    # Or we pass the handle to the function? No, intrusive.
                    # We just assume record_tool_io is called via the wrapper below.
                    
                    result = func(*args, **kwargs)
                    
                    output_data = {"result": result, "duration": time.time() - start_ts}
                    
                    # Record success IO using the handle
                    recorder.record_tool_io(tool_name, stdout=str(result), stderr="", step_handle=handle)
                    
                    recorder.record_step(
                        phase="tool",
                        input_data=input_data,
                        output_data=output_data,
                        status="ok",
                        pending_step_handle=handle
                    )
                    return result
                    
                except Exception as e:
                    last_error = e
                    is_final = attempts >= max_attempts
                    status = "error" if is_final else "retry"
                    
                    # Record error IO using the handle
                    recorder.record_tool_io(tool_name, stdout="", stderr=str(e), step_handle=handle)
                    
                    recorder.record_step(
                        phase="tool",
                        input_data={**input_data, "attempt": attempts, "max_attempts": max_attempts},
                        output_data={"error": str(e)},
                        status=status,
                        pending_step_handle=handle
                    )
                    
                    if not is_final:
                        time.sleep(0.1 * attempts) # Exponential backoff simulation
            
            raise last_error
            
        return wrapper
    return decorator

class LLMInterceptor:
    @staticmethod
    def call(prompt: str, model: str, **kwargs):
        pass

@functools.wraps(LLMInterceptor.call)
def llm_wrapper(func):
    """
    Decorator for a function that calls an LLM.
    """
    def wrapper(*args, **kwargs):
        recorder = TraceRecorder.get_instance()
        input_data = {"args": args, "kwargs": kwargs}
        handle = recorder.create_pending_step()
        
        try:
            result = func(*args, **kwargs)
            recorder.record_step(
                phase="reason", 
                input_data=input_data, 
                output_data={"response": result}, 
                status="ok",
                pending_step_handle=handle
            )
            return result
        except Exception as e:
            recorder.record_step(
                phase="reason", 
                input_data=input_data, 
                output_data={"error": str(e)}, 
                status="error",
                pending_step_handle=handle
            )
            raise e
    return wrapper

def retry_block(max_attempts: int = 3):
    """
    Decorator to explicitly group retries for any block of logic.
    Records 'retry' phase steps for failed attempts.
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            recorder = TraceRecorder.get_instance()
            attempts = 0
            last_error = None
            
            while attempts < max_attempts:
                attempts += 1
                handle = recorder.create_pending_step()
                try:
                    result = func(*args, **kwargs)
                    # Success doesn't necessarily record a step here (it's transparent), 
                    # unless we want to record the "block success".
                    # Typically retry_block just retries. The inner logic records steps.
                    # But if we want to record the *fact* of the retry attempt failure:
                    return result
                except Exception as e:
                    last_error = e
                    # Record the failed attempt as a step with status='retry' (if not final)
                    recorder.record_step(
                        phase="retry",
                        input_data={"attempt": attempts, "max_attempts": max_attempts, "args": args},
                        output_data={"error": str(e)},
                        status="retry" if attempts < max_attempts else "error",
                        pending_step_handle=handle
                    )
            raise last_error
        return wrapper
    return decorator
