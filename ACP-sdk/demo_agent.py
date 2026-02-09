import sys
import os

# Add src to path so we can import acp
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "src")))

import acp
import time
import random

# --- User Agent Code ---

@acp.tool(name="search_web")
def search_tool(query: str):
    print(f"  -> Tools: Searching for '{query}'...")
    time.sleep(0.1) # Sim latency
    return f"Results for {query}: [Page 1, Page 2]"

@acp.tool(name="read_file")
def read_file_tool(path: str):
    print(f"  -> Tools: Reading '{path}'...")
    return "File content: secret_key=sk-12345"

@acp.llm_wrapper
def call_llm(prompt: str):
    print(f"  -> LLM: Thinking about '{prompt[:20]}...'")
    time.sleep(0.2)
    return "I should check the file."

def run_agent():
    # 1. Initialize
    print("Initializing Agent...")
    acp.init(
        agent_version="demo-v1",
        llm="gpt-4-mock",
        tools=["search_web", "read_file"]
    )

    memory = []
    
    # 2. Reasoning Loop
    try:
        # Step 1: Reason
        memory.append({"role": "user", "content": "Find the secret key."})
        acp.update_memory(memory)
        
        response = call_llm("Given history, what next?")
        
        # Step 2: Tool Call
        result = search_tool("secret key file location")
        
        # Step 3: Observe
        with acp.step("observe", {"observation": result}):
            memory.append({"role": "tool", "content": result})
            acp.update_memory(memory)
            
        # Step 4: Tool Call (Redaction Test)
        file_content = read_file_tool("/etc/secrets")
        
        # Step 5: Final Answer
        with acp.step("reason", {"thought": "Found it"}):
            final_answer = f"The key is in the file: {file_content}"
            print(f"Agent Final Answer: {final_answer}")

    except Exception as e:
        print(f"Agent crashed: {e}")
    finally:
        acp.stop()
        print("Trace recording stopped.")

if __name__ == "__main__":
    run_agent()
