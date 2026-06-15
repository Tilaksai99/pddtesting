import logging
import re
import requests
from functools import lru_cache
from urllib.parse import quote
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)




class MedicalNormalizer:
    def __init__(self):
        logger.info("Initializing MedicalNormalizer.")

    def normalize(self, extracted_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalizes extracted entities via NIH API only.
        If the API returns nothing valid, keeps the original extracted text as-is.
        Never substitutes fake or hardcoded data.
        """
        normalized_data = {}

        for category, items in extracted_data.items():
            if category in ["confidence_scores", "detected_sections"]:
                normalized_data[category] = items
                continue

            normalized_data[category] = []

            for item in items:
                standard_name = _cached_api_lookup(item, category)
                # Keep original if API returned nothing valid
                normalized_data[category].append(standard_name if standard_name else item)

            # Deduplicate while preserving order
            normalized_data[category] = list(dict.fromkeys(normalized_data[category]))

        return normalized_data


# FIX Bug 3: Module-level cached function so results persist across requests.
# lru_cache cannot be applied directly to instance methods, so this lives outside the class.
def _is_valid_term(name: str) -> bool:
    """Rejects API responses that are numeric codes, not human-readable terms."""
    if not name or len(name.strip()) < 3:
        return False
    stripped = re.sub(r"[\s\-/.,:]", "", name.strip())
    if stripped.isdigit():
        return False
    if sum(c.isdigit() for c in name) / len(name) > 0.5:
        return False
    return True


@lru_cache(maxsize=512)
def _cached_api_lookup(text: str, category: str) -> Optional[str]:
    """
    Cached NIH API lookup. Returns the standardized name if found and valid.
    Returns None if the API returns nothing, returns a numeric code, or fails.
    The caller keeps the original extracted text when None is returned.
    """
    if category == "lab_findings":
        return None  # No NIH endpoint covers lab findings

    encoded_text = quote(text)

    try:
        if category == "medications":
            url = f"https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search?terms={encoded_text}&maxList=1"
            response = requests.get(url, timeout=3)
            if response.status_code == 200:
                data = response.json()
                if data[0] > 0 and len(data[1]) > 0:
                    name = data[1][0]
                    return name if _is_valid_term(name) else None

        elif category in ["diagnosis", "symptoms"]:
            url = f"https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?terms={encoded_text}&maxList=1"
            response = requests.get(url, timeout=3)
            if response.status_code == 200:
                data = response.json()
                if data[0] > 0 and len(data[1]) > 0:
                    name = data[1][0]
                    return name if _is_valid_term(name) else None

        elif category == "procedures":
            url = f"https://clinicaltables.nlm.nih.gov/api/icd10pcs/v3/search?terms={encoded_text}&maxList=1"
            response = requests.get(url, timeout=3)
            if response.status_code == 200:
                data = response.json()
                if data[0] > 0 and len(data[3]) > 0 and len(data[3][0]) > 0:
                    name = data[3][0][0]
                    return name if _is_valid_term(name) else None

    except Exception as e:
        logger.warning(f"API normalization failed for '{text}' (category='{category}'): {e}")

    return None