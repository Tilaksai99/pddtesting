import os
import logging
from pathlib import Path 
from typing import List

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel 
from dotenv import load_dotenv

# ─────────────────────────────────────────────────────────────
# Load .env correctly
# ─────────────────────────────────────────────────────────────

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# ─────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Router
# ─────────────────────────────────────────────────────────────

router = APIRouter()

# ─────────────────────────────────────────────────────────────
# Environment Variables
# ─────────────────────────────────────────────────────────────

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

print("GROQ_API_KEY =", GROQ_API_KEY[:15] + "..." if GROQ_API_KEY else "NOT FOUND")

# ─────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


# ─────────────────────────────────────────────────────────────
# System Prompt
# ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """
You are Antigravity AI, a professional medical billing and coding assistant.

Your expertise includes:
- ICD-10-CM/PCS diagnosis and procedure coding
- AMA CPT billing codes
- HCPCS Level II codes
- Insurance denial auditing
- Medical necessity review
- E&M coding guidelines
- Modifier rules
- Prior authorization workflows

Rules:
1. Give concise and highly structured answers.
2. Use bullet points for medical codes.
3. Explain modifier logic and medical necessity clearly.
4. Maintain a professional healthcare administrative tone.
5. If a question is unrelated to healthcare or billing,
   politely redirect the user back to medical coding topics.
"""

# ─────────────────────────────────────────────────────────────
# Helper Function
# ─────────────────────────────────────────────────────────────

def sanitise_messages(messages: List[ChatMessage]):

    cleaned = []

    for msg in messages:

        role = "assistant"

        if msg.role.lower() == "user":
            role = "user"

        cleaned.append({
            "role": role,
            "content": msg.content
        })

    # Remove leading assistant messages
    while cleaned and cleaned[0]["role"] != "user":
        cleaned.pop(0)

    # Merge consecutive same-role messages
    merged = []

    for msg in cleaned:

        if merged and merged[-1]["role"] == msg["role"]:
            merged[-1]["content"] += "\n" + msg["content"]
        else:
            merged.append(msg)

    return merged


# ─────────────────────────────────────────────────────────────
# API Endpoint
# ─────────────────────────────────────────────────────────────

@router.post("/assistant/chat")
async def chat_with_assistant(body: ChatRequest):

    # ---------------------------------------------------------
    # Missing API Key
    # ---------------------------------------------------------

    if not GROQ_API_KEY:

        logger.warning("GROQ_API_KEY not found.")

        reply = (
            "⚠️ GROQ_API_KEY missing.\n\n"
            "Please add GROQ_API_KEY in backend/.env"
        )

        return {
            "reply": reply,
            "message": reply,
            "content": reply
        }

    # ---------------------------------------------------------
    # Prepare Conversation
    # ---------------------------------------------------------

    groq_messages = sanitise_messages(body.messages)

    if not groq_messages:

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No valid user messages found."
        )

    # Add system message
    groq_messages.insert(0, {
        "role": "system",
        "content": SYSTEM_PROMPT
    })

    # ---------------------------------------------------------
    # Groq API Config
    # ---------------------------------------------------------

    url = "https://api.groq.com/openai/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": groq_messages,
        "temperature": 0.4,
        "max_tokens": 1024
    }

    # ---------------------------------------------------------
    # API Request
    # ---------------------------------------------------------

    try:

        async with httpx.AsyncClient(timeout=60.0) as client:

            response = await client.post(
                url,
                headers=headers,
                json=payload
            )

            logger.info(f"Groq Status Code: {response.status_code}")

            # -------------------------------------------------
            # Handle API Errors
            # -------------------------------------------------

            if response.status_code == 429:

                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded. Please try again later."
                )

            if response.status_code != 200:

                logger.error(
                    f"Groq API Error {response.status_code}: "
                    f"{response.text}"
                )

                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=response.text
                )

            # -------------------------------------------------
            # Parse Response
            # -------------------------------------------------

            data = response.json()

            choices = data.get("choices", [])

            ai_reply = ""

            if choices:

                ai_reply = (
                    choices[0]
                    .get("message", {})
                    .get("content", "")
                )

            if not ai_reply:

                ai_reply = (
                    "I'm sorry, I could not generate a response."
                )

            # -------------------------------------------------
            # Return Response
            # -------------------------------------------------

            return {
                "reply": ai_reply,
                "message": ai_reply,
                "content": ai_reply
            }

    # ---------------------------------------------------------
    # Request Errors
    # ---------------------------------------------------------

    except httpx.RequestError as e:

        logger.error(f"HTTP Request Error: {e}")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to Groq API: {str(e)}"
        )

    # ---------------------------------------------------------
    # HTTP Exceptions
    # ---------------------------------------------------------

    except HTTPException:
        raise

    # ---------------------------------------------------------
    # Unknown Errors
    # ---------------------------------------------------------

    except Exception as e:

        logger.error(f"Unexpected Error: {e}")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )