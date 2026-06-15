"""
ai_coding_fallback.py
─────────────────────
When Neo4j has no ICD / CPT / HCPCS codes for extracted entities, this module
calls the Groq-hosted Llama model to suggest the correct billing codes.

Flow:
    graph_codes = graph_db.fetch_codes_from_graph(normalized_data)
    if graph_codes["not_found"]["diagnoses"] or graph_codes["not_found"]["procedures"]:
        ai_suggestions = get_ai_code_suggestions(
            not_found    = graph_codes["not_found"],
            raw_text     = raw_report_text,
            report_id    = report_id,
            db           = db_session,
        )

The function:
  1. Filters out generic noise terms (e.g. bare "Symptoms") before sending.
  2. Sends missing entities + original report text to Groq / Llama.
  3. Gets back structured ICD / CPT suggestions with reasoning.
  4. Saves each suggestion as a PendingCodeReview row (status = "pending").
  5. Returns the suggestions so upload.py can include them in the response.
"""

import json
import logging
import os
import uuid
from typing import Any, Dict, List, Optional

import requests
from sqlalchemy.orm import Session

# ── load_dotenv MUST run before os.getenv ─────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv optional; env vars may already be set by the process

from backend.database import PendingCodeReview

logger = logging.getLogger(__name__)

# ── Groq endpoint ─────────────────────────────────────────────────────────────
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")   # now safe — load_dotenv() ran first

# Generic single-word labels that the NER sometimes emits as entity text.
# These are category names, not real clinical terms — skip them.
_NOISE_TERMS = {
    "symptoms", "symptom", "diagnosis", "diagnoses", "procedure",
    "procedures", "medication", "medications", "finding", "findings",
    "disease", "condition", "conditions", "test", "tests",
}

# ── System prompt ─────────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """You are a certified medical billing specialist and clinical coder with expertise in ICD-10-CM and CPT/HCPCS coding.

You will receive:
1. A list of diagnoses/symptoms that need ICD-10 codes.
2. A list of procedures that need CPT or HCPCS codes.
3. The original medical report text for context.

Return ONLY a valid JSON object — no preamble, no markdown fences, no explanation outside the JSON.

Schema:
{
  "icd_suggestions": [
    {
      "entity": "<original extracted term>",
      "suggested_code": "<ICD-10 code, e.g. J06.9>",
      "description": "<official code description>",
      "confidence": <0-100 integer>,
      "reasoning": "<one sentence why this code fits>"
    }
  ],
  "cpt_suggestions": [
    {
      "entity": "<original extracted term>",
      "suggested_code": "<CPT or HCPCS code>",
      "code_type": "CPTCode" | "HCPCSCode",
      "description": "<official code description>",
      "confidence": <0-100 integer>,
      "reasoning": "<one sentence why this code fits>"
    }
  ]
}

Rules:
- Use only real, valid ICD-10-CM and CPT/HCPCS 2024 codes.
- If you are genuinely unsure about a code, set confidence below 60 and say so in reasoning.
- Never invent codes. If no code is appropriate, omit the entry entirely.
- Do not include markdown, backticks, or any text outside the JSON object.
"""


def _filter_noise(terms: List[str]) -> List[str]:
    """
    Removes generic category words that the NER emits as entity text
    (e.g. the bare word 'Symptoms' or 'Diagnosis').  These have no
    useful ICD / CPT mapping and confuse the LLM.
    """
    return [t for t in terms if t.strip().lower() not in _NOISE_TERMS]


def _build_user_prompt(
    missing_diagnoses: List[str],
    missing_procedures: List[str],
    raw_text: str,
) -> str:
    lines = ["Please suggest billing codes for the following:"]

    if missing_diagnoses:
        lines.append("\nDIAGNOSES / SYMPTOMS needing ICD-10 codes:")
        for d in missing_diagnoses:
            lines.append(f"  - {d}")

    if missing_procedures:
        lines.append("\nPROCEDURES needing CPT / HCPCS codes:")
        for p in missing_procedures:
            lines.append(f"  - {p}")

    if raw_text:
        truncated = raw_text[:3000] + ("…" if len(raw_text) > 3000 else "")
        lines.append(f"\nOriginal report text for context:\n---\n{truncated}\n---")

    return "\n".join(lines)


def get_ai_code_suggestions(
    not_found: Dict[str, List[str]],
    raw_text: str,
    report_id: str,
    db: Session,
) -> Dict[str, Any]:
    """
    Main entry point called from upload.py.

    Parameters
    ----------
    not_found   : {"diagnoses": [...], "procedures": [...]} from graph layer
    raw_text    : original extracted report text (for AI context)
    report_id   : UUID of the Report row being processed
    db          : active SQLAlchemy session

    Returns
    -------
    {
        "icd_suggestions":    [...],
        "cpt_suggestions":    [...],
        "pending_review_ids": [...]   # UUIDs of saved PendingCodeReview rows
    }
    """
    # ── Guard: API key must be present ────────────────────────────────────────
    if not GROQ_API_KEY:
        logger.error(
            "GROQ_API_KEY is not set. "
            "Add it to your .env file and restart the server."
        )
        return {
            "icd_suggestions":    [],
            "cpt_suggestions":    [],
            "pending_review_ids": [],
            "error": "GROQ_API_KEY not configured",
        }

    # ── Filter noise terms before sending to the LLM ─────────────────────────
    missing_diagnoses  = _filter_noise(not_found.get("diagnoses",  []))
    missing_procedures = _filter_noise(not_found.get("procedures", []))

    if not missing_diagnoses and not missing_procedures:
        logger.info("AI fallback: nothing meaningful to look up after noise filtering.")
        return {"icd_suggestions": [], "cpt_suggestions": [], "pending_review_ids": []}

    logger.info(
        f"AI fallback triggered — "
        f"{len(missing_diagnoses)} missing diagnoses, "
        f"{len(missing_procedures)} missing procedures."
    )

    # ── Call Groq / Llama ─────────────────────────────────────────────────────
    user_prompt = _build_user_prompt(missing_diagnoses, missing_procedures, raw_text)

    payload = {
        "model":      GROQ_MODEL,
        "max_tokens": 1500,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
    }

    raw_content = ""
    try:
        response = requests.post(
            GROQ_API_URL,
            json=payload,
            headers={
                "Content-Type":  "application/json",
                "Authorization": f"Bearer {GROQ_API_KEY}",
            },
            timeout=30,
        )
        response.raise_for_status()
        raw_content = response.json()["choices"][0]["message"]["content"].strip()

        # Strip accidental markdown fences the model might add despite instructions
        if raw_content.startswith("```"):
            raw_content = raw_content.split("```")[1]
            if raw_content.startswith("json"):
                raw_content = raw_content[4:]

        ai_data = json.loads(raw_content)

    except requests.RequestException as e:
        logger.error(f"Groq API request failed: {e}")
        return {"icd_suggestions": [], "cpt_suggestions": [], "pending_review_ids": [], "error": str(e)}
    except (json.JSONDecodeError, KeyError) as e:
        logger.error(f"Groq response parse failed: {e}. Raw: {raw_content[:300]}")
        return {"icd_suggestions": [], "cpt_suggestions": [], "pending_review_ids": [], "error": str(e)}

    icd_suggestions = ai_data.get("icd_suggestions", [])
    cpt_suggestions = ai_data.get("cpt_suggestions", [])

    logger.info(
        f"Groq returned {len(icd_suggestions)} ICD suggestions, "
        f"{len(cpt_suggestions)} CPT suggestions."
    )

    # ── Persist each suggestion as a PendingCodeReview ────────────────────────
    pending_ids: List[str] = []

    for item in icd_suggestions:
        row = PendingCodeReview(
            id             = str(uuid.uuid4()),
            report_id      = report_id,
            entity         = item.get("entity", ""),
            entity_type    = "diagnosis",
            suggested_code = item.get("suggested_code", ""),
            code_type      = "ICDCode",
            description    = item.get("description", ""),
            confidence     = item.get("confidence", 0),
            reasoning      = item.get("reasoning", ""),
            status         = "pending",
        )
        db.add(row)
        pending_ids.append(row.id)

    for item in cpt_suggestions:
        row = PendingCodeReview(
            id             = str(uuid.uuid4()),
            report_id      = report_id,
            entity         = item.get("entity", ""),
            entity_type    = "procedure",
            suggested_code = item.get("suggested_code", ""),
            code_type      = item.get("code_type", "CPTCode"),
            description    = item.get("description", ""),
            confidence     = item.get("confidence", 0),
            reasoning      = item.get("reasoning", ""),
            status         = "pending",
        )
        db.add(row)
        pending_ids.append(row.id)

    db.commit()
    logger.info(f"Saved {len(pending_ids)} PendingCodeReview rows for report {report_id}.")

    return {
        "icd_suggestions":    icd_suggestions,
        "cpt_suggestions":    cpt_suggestions,
        "pending_review_ids": pending_ids,
    } 