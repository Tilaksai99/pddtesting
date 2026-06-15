import logging
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

class ClinicalRuleEngine:
    def __init__(self):
        logger.info("Initializing ClinicalRuleEngine.") 

    def apply_rules(self, normalized_data: Dict[str, Any], graph_codes: Dict[str, Any]) -> Dict[str, Any]:
        """
        Applies clinical and administrative rules based on the normalized medical text 
        and the billing codes fetched from the Graph DB.
        """
        results = {
            "icd_codes": graph_codes.get("icd_codes", []),
            "cpt_codes": graph_codes.get("cpt_codes", []),
            "hcpcs_codes": graph_codes.get("hcpcs_codes", []),
            "insurance_flags": [],
            "clinical_alerts": []
        }
        
        diagnoses = normalized_data.get("diagnosis", [])
        procedures = normalized_data.get("procedures", [])
        medications = normalized_data.get("medications", [])
        
        # 1. Insurance Rules (Pre-Auth Checks)
        # We can now write rules based on either the text OR the CPT codes!
        # Example Rule: MRI requires pre-authorization
        if "MRI Brain" in procedures:
            results["insurance_flags"].append({
                "rule": "PRE_AUTH_REQUIRED",
                "entity": "MRI Brain",
                "message": "MRI Brain requires insurance pre-authorization."
            })
            
        # Example Rule based on fetched code:
        for cpt in results["cpt_codes"]:
            if cpt.get("code") == "71045": # Chest X-Ray
                # Just an example of how you can write rules based on the code directly
                pass
        
        # 2. Clinical Rules
        # Example Rule: Antibiotics prescribed for a Viral Infection
        is_viral = any("Viral" in d for d in diagnoses)
        has_antibiotic = "Amoxicillin" in medications
        if is_viral and has_antibiotic:
            results["clinical_alerts"].append({
                "rule": "CONTRAINDICATION",
                "message": "Antibiotic (Amoxicillin) prescribed, but diagnosis is Viral. Please review."
            })
            
        return results
