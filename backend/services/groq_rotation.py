import os
import json
import logging
from typing import List, Optional, Dict, Any
from groq import Groq
from config import settings

logger = logging.getLogger("groq_rotation")

def sanitize_unicode(obj: Any) -> Any:
    """Recursively normalizes problematic Unicode characters to standard ASCII for Windows console safety."""
    if isinstance(obj, str):
        cleaned = obj.replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', '--')
        cleaned = cleaned.replace('\u2018', "'").replace('\u2019', "'").replace('\u201c', '"').replace('\u201d', '"')
        cleaned = cleaned.replace('\u00a0', ' ')
        return cleaned
    elif isinstance(obj, dict):
        return {sanitize_unicode(k): sanitize_unicode(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_unicode(item) for item in obj]
    return obj

class GroqKeyRotator:
    """
    Manages Groq API key rotation across multiple keys (GROQ_API_KEY_1, 2, 3)
    and fallback models (openai/gpt-oss-120b, qwen/qwen3.8-27b, openai/gpt-oss-20b)
    to guarantee high availability and prevent rate limit exhaustion.
    """
    def __init__(self):
        self.keys: List[str] = []
        for k in [settings.groq_api_key_1, settings.groq_api_key_2, settings.groq_api_key_3]:
            if k and hasattr(k, "get_secret_value") and k.get_secret_value():
                self.keys.append(k.get_secret_value().strip())
        
        # Check standard env vars as fallback
        for env_var in ["GROQ_API_KEY_1", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_API_KEY"]:
            val = os.getenv(env_var)
            if val and val.strip() and val.strip() not in self.keys:
                self.keys.append(val.strip())

        self.current_key_idx = 0
        self.models = [
            settings.groq_model or "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-20b"
        ]

    def _get_client(self) -> Optional[Groq]:
        if not self.keys:
            return None
        key = self.keys[self.current_key_idx % len(self.keys)]
        return Groq(api_key=key)

    def rotate_key(self):
        if self.keys:
            prev = self.current_key_idx
            self.current_key_idx = (self.current_key_idx + 1) % len(self.keys)
            logger.info(f"Rotated Groq API key from index {prev} to {self.current_key_idx}")

    def call_json_completion(
        self,
        prompt: str,
        system_prompt: str = "You are an institutional research intelligence AI. Output only valid JSON.",
        temperature: float = 0.1,
        max_tokens: int = 2000
    ) -> Optional[Dict[str, Any]]:
        """
        Executes a JSON-mode chat completion with automatic key rotation and model fallback.
        Returns parsed JSON dict or None if all attempts fail.
        """
        if not self.keys:
            logger.warning("No Groq API keys configured. LLM calls will use heuristic fallback.")
            return None

        attempts = 0
        max_attempts = len(self.keys) * len(self.models)

        for model in self.models:
            for _ in range(len(self.keys)):
                attempts += 1
                client = self._get_client()
                if not client:
                    return None

                try:
                    response = client.chat.completions.create(
                        model=model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt}
                        ],
                        response_format={"type": "json_object"},
                        temperature=temperature,
                        max_tokens=max_tokens
                    )
                    content = response.choices[0].message.content
                    if content:
                        parsed = json.loads(content)
                        return sanitize_unicode(parsed)
                except json.JSONDecodeError as jde:
                    logger.warning(f"Groq output was not valid JSON from model {model}: {jde}")
                    # Try to extract JSON substring if wrapped in markdown code fence
                    try:
                        clean = content.strip()
                        if "```json" in clean:
                            clean = clean.split("```json")[1].split("```")[0].strip()
                        elif "```" in clean:
                            clean = clean.split("```")[1].split("```")[0].strip()
                        return sanitize_unicode(json.loads(clean))
                    except Exception:
                        pass
                except Exception as e:
                    err_str = str(e).lower()
                    logger.warning(f"Groq API error on model {model} (key idx {self.current_key_idx}): {e}")
                    # Rotate key on rate limit or authorization errors
                    if "429" in err_str or "rate limit" in err_str or "auth" in err_str or "quota" in err_str:
                        self.rotate_key()
                    continue

        logger.error(f"All Groq API key and model attempts failed after {attempts} attempts.")
        return None

# Singleton instance
groq_rotator = GroqKeyRotator()
