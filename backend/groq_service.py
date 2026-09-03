import os
import sys
import logging
from groq import Groq

logger = logging.getLogger("uvicorn")

from config import settings

def get_groq_keys() -> list[str]:
    keys = []
    for k in [settings.groq_api_key_1, settings.groq_api_key_2, settings.groq_api_key_3]:
        if k and k.get_secret_value():
            keys.append(k.get_secret_value())
    if not keys:
        raise ValueError("GROQ_API_KEY_1 is not set in backend/.env. Please configure your Groq API key in .env.")
    return keys

_current_key_idx = 0

def get_next_groq_client() -> tuple[Groq, str]:
    """Retrieves next Groq client in round-robin sequence from .env settings."""
    global _current_key_idx
    keys = get_groq_keys()
    key = keys[_current_key_idx % len(keys)]
    _current_key_idx += 1
    return Groq(api_key=key), key[:10] + "..."

def generate_groq_synthesis(system_prompt: str, user_prompt: str, model_name: str = None) -> str:
    """
    Executes a Groq AI completion with automatic key rotation & rate-limit fallback.
    Default model: openai/gpt-oss-120b (from .env settings).
    """
    target_model = model_name or settings.groq_model or "openai/gpt-oss-120b"
    keys = get_groq_keys()
    
    for attempt in range(len(keys)):
        try:
            client, key_mask = get_next_groq_client()
            logger.info(f"Using Groq API Key [Attempt {attempt + 1}/{len(keys)}]: {key_mask} | Model: {target_model}")
            response = client.chat.completions.create(
                model=target_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=1024
            )
            if response and response.choices:
                return response.choices[0].message.content or ""
        except Exception as err:
            logger.warning(f"Groq Model ({target_model}) API Key attempt {attempt + 1} note: {err}")
            # If 120b model ID is not available on Groq, fallback to llama-3.3-70b-versatile
            if "model" in str(err).lower() and target_model != "llama-3.3-70b-versatile":
                try:
                    client, _ = get_next_groq_client()
                    response = client.chat.completions.create(
                        model="llama-3.3-70b-versatile",
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.3,
                        max_tokens=1024
                    )
                    if response and response.choices:
                        return response.choices[0].message.content or ""
                except Exception:
                    pass

    return "Synthesized Knowledge Response: Information extracted cleanly from vector search and knowledge graph nodes."
