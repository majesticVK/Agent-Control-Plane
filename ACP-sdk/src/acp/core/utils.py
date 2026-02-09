import re
from typing import Any, Dict, List, Union

class SecretRedactor:
    PATTERNS = [
        r"sk-[a-zA-Z0-9]{20,}",  # OpenAI
        r"ghp_[a-zA-Z0-9]{20,}",  # GitHub
        r"eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}",  # JWT
        r"xox[baprs]-[a-zA-Z0-9]{10,}",  # Slack
    ]

    @classmethod
    def redact(cls, text: str) -> str:
        if not text:
            return text
        redacted = text
        for pattern in cls.PATTERNS:
            redacted = re.sub(pattern, "********", redacted)
        return redacted

    @classmethod
    def redact_object(cls, obj: Any) -> Any:
        if isinstance(obj, str):
            return cls.redact(obj)
        if isinstance(obj, list):
            return [cls.redact_object(item) for item in obj]
        if isinstance(obj, dict):
            new_obj = {}
            for key, value in obj.items():
                if re.search(r"key|token|secret|password|auth", key, re.IGNORECASE):
                    new_obj[key] = "********"
                else:
                    new_obj[key] = cls.redact_object(value)
            return new_obj
        return obj

class TraceLimits:
    MAX_STEPS = 1000
    MAX_SNAPSHOT_SIZE_BYTES = 10 * 1024 * 1024  # 10MB
