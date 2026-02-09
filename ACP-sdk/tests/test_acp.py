import unittest
import shutil
import tempfile
import os
import time
import json
from acp.core.recorder import TraceRecorder
from acp.runtime.boundaries import step, boundary
from acp.integrations.interceptors import tool, retry_block
import acp

class TestACP(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.recorder = TraceRecorder.get_instance()
        self.recorder.base_path = self.test_dir
        self.recorder.set_strict_mode(True)
        # Reset instance state for clean tests (singleton hack)
        self.recorder.active = False
        self.recorder.current_run_id = None
        self.recorder.run_dir = None

    def tearDown(self):
        if self.recorder.active:
            self.recorder.stop_run()
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_strict_mode_violation(self):
        with self.assertRaises(RuntimeError):
            with step("reason"):
                pass

    def test_mutable_step_context(self):
        acp.init("test", "test-llm")
        with step("reason") as ctx:
            ctx.set_output("thought", "value")
        
        # Verify output
        with open(os.path.join(self.recorder.run_dir, "steps.jsonl"), "r") as f:
            line = f.readline()
            self.assertIn('"thought": "value"', line)

    def test_retry_policy_with_io_isolation(self):
        acp.init("test", "test-llm")
        
        @tool(name="flaky_tool", retry_policy=2)
        def flaky():
            if not hasattr(flaky, "calls"):
                flaky.calls = 0
            flaky.calls += 1
            if flaky.calls < 2:
                raise ValueError("Fail 1")
            return "Success"

        result = flaky()
        self.assertEqual(result, "Success")
        
        # Verify trace has 1 retry step and 1 success step
        with open(os.path.join(self.recorder.run_dir, "steps.jsonl"), "r") as f:
            lines = f.readlines()
            self.assertEqual(len(lines), 2)
            self.assertIn('"status": "retry"', lines[0])
            self.assertIn('"status": "ok"', lines[1])
            
        # Verify IO files exist and are correct
        # Step 1: Retry (Fail 1)
        # Step 2: Success
        tools_dir = os.path.join(self.recorder.run_dir, "tools")
        self.assertTrue(os.path.exists(os.path.join(tools_dir, "step_1.stderr")))
        self.assertTrue(os.path.exists(os.path.join(tools_dir, "step_2.stdout")))

    def test_nested_tools_io_isolation(self):
        acp.init("test", "test-llm")
        
        @tool(name="inner")
        def inner_tool():
            return "Inner"
            
        @tool(name="outer")
        def outer_tool():
            # This tool produces IO before and after the inner tool
            # In the old model, "Inner" IO might collide with "Outer" pending IO
            res = inner_tool()
            return f"Outer({res})"
            
        outer_tool()
        
        # Expectation:
        # Step 1: inner (Inner)
        # Step 2: outer (Outer(Inner))
        
        with open(os.path.join(self.recorder.run_dir, "steps.jsonl"), "r") as f:
            lines = f.readlines()
            step1 = json.loads(lines[0])
            step2 = json.loads(lines[1])
            
            self.assertEqual(step1["phase"], "tool")
            self.assertIn("inner", str(step1["input"]))
            
            self.assertEqual(step2["phase"], "tool")
            self.assertIn("outer", str(step2["input"]))
            
        # Verify IO
        tools_dir = os.path.join(self.recorder.run_dir, "tools")
        with open(os.path.join(tools_dir, "step_1.stdout"), "r") as f:
            self.assertIn("Inner", f.read())
        with open(os.path.join(tools_dir, "step_2.stdout"), "r") as f:
            self.assertIn("Outer(Inner)", f.read())

if __name__ == '__main__':
    unittest.main()
