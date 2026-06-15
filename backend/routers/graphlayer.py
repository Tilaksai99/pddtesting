import logging
import os
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

# ── Neo4j ──────────────────────────────────────────────────────────────────────
try:
    from neo4j import GraphDatabase
    HAS_NEO4J = True
except ImportError:
    HAS_NEO4J = False
    logger.warning("neo4j driver not installed.")


class MedicalKnowledgeGraph:
    def __init__(self):
        logger.info("Initializing MedicalKnowledgeGraph.")
        self.driver = None

        if HAS_NEO4J:
            try:
                from dotenv import load_dotenv
                load_dotenv()
            except ImportError:
                pass

            uri      = os.environ.get("NEO4J_URI",      "bolt://localhost:7687")
            user     = os.environ.get("NEO4J_USER",     "neo4j")
            password = os.environ.get("NEO4J_PASSWORD", "password")

            try:
                self.driver = GraphDatabase.driver(uri, auth=(user, password))
                self.driver.verify_connectivity()
                logger.info("Neo4j connected ✓")
            except Exception as e:
                logger.error(f"Neo4j connection failed: {e}")
                self.driver = None

    def close(self):
        if self.driver:
            self.driver.close()

    # ──────────────────────────────────────────────────────────────────────────
    # Build patient graph
    # ──────────────────────────────────────────────────────────────────────────
    def build_patient_graph(self, patient_id: str, normalized_data: Dict[str, List[str]]) -> Dict[str, Any]:
        if not self.driver:
            return {
                "status":  "error",
                "message": "Neo4j not connected. Patient graph could not be saved.",
            }

        summary_nodes = 1
        summary_edges = 0

        CATEGORY_META = {
            "symptoms":     ("Symptoms",     "HAS_SYMPTOM"),
            "diagnosis":    ("Diagnosis",    "HAS_DIAGNOSIS"),
            "procedures":   ("Procedures",   "UNDERWENT_PROCEDURE"),
            "medications":  ("Medications",  "PRESCRIBED_MEDICATION"),
            "lab_findings": ("Lab_findings", "HAS_FINDING"),
        }

        with self.driver.session() as session:
            session.run("MERGE (p:Patient {id: $pid})", pid=patient_id)

            for category, items in normalized_data.items():
                if category in ("confidence_scores", "detected_sections"):
                    continue
                if not isinstance(items, list):
                    continue

                label, relation = CATEGORY_META.get(category, (category.capitalize(), "RELATED_TO"))

                for item in items:
                    query = f"""
                    MERGE (e:{label} {{name: $item_name}})
                    WITH e
                    MATCH (p:Patient {{id: $pid}})
                    MERGE (p)-[:{relation}]->(e)
                    """
                    session.run(query, item_name=item, pid=patient_id)
                    summary_nodes += 1
                    summary_edges += 1

        return {
            "status":                   "success",
            "message":                  "Patient graph built in Neo4j.",
            "nodes_inserted_or_merged": summary_nodes,
            "edges_inserted_or_merged": summary_edges,
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Fetch ICD / CPT / HCPCS codes — Neo4j ONLY, no fallback
    # ──────────────────────────────────────────────────────────────────────────
    def fetch_codes_from_graph(self, normalized_data: Dict[str, List[str]]) -> Dict[str, Any]:
        results: Dict[str, Any] = {
            "icd_codes":   [],
            "cpt_codes":   [],
            "hcpcs_codes": [],
            "not_found":   {
                "diagnoses":  [],
                "procedures": [],
            },
        }

        if not self.driver:
            logger.error("Neo4j not connected — cannot fetch codes.")
            results["not_found"]["diagnoses"]  = normalized_data.get("diagnosis", []) + normalized_data.get("symptoms", [])
            results["not_found"]["procedures"] = normalized_data.get("procedures", [])
            return results

        diagnoses  = normalized_data.get("diagnosis",  [])
        procedures = normalized_data.get("procedures", [])
        symptoms   = normalized_data.get("symptoms",   [])

        # combine diagnoses + symptoms for ICD lookup, deduplicated
        all_diag_terms = list(dict.fromkeys(diagnoses + symptoms))

        try:
            with self.driver.session() as session:

                # ── ICD codes for diagnoses / symptoms ────────────────────────
                for term in all_diag_terms:
                    query = """
                    MATCH (d {name: $name})-[:MAPS_TO]->(i:ICDCode)
                    WHERE d:Diagnosis OR d:Symptoms
                    RETURN i.code AS code
                    """
                    records = list(session.run(query, name=term))
                    found = False
                    for record in records:
                        code = record.get("code")
                        if code:
                            results["icd_codes"].append({"diagnosis": term, "code": code})
                            found = True
                    if not found:
                        logger.warning(f"No ICD code found in Neo4j for '{term}'.")
                        results["not_found"]["diagnoses"].append(term)

                # ── CPT / HCPCS codes for procedures ──────────────────────────
                for proc in procedures:
                    found = False

                    # try :Procedures (plural — written by build_patient_graph)
                    query = """
                    MATCH (p:Procedures {name: $name})-[:BILLED_AS]->(code)
                    OPTIONAL MATCH (code)-[:REQUIRES_MODIFIER]->(m:Modifier)
                    RETURN labels(code)[0] AS code_type,
                           code.code      AS code_val,
                           collect(m.code) AS modifiers
                    """
                    for record in session.run(query, name=proc):
                        cv = record.get("code_val")
                        if cv:
                            entry = {"procedure": proc, "code": cv, "modifiers": record.get("modifiers", [])}
                            if record.get("code_type") == "CPTCode":
                                results["cpt_codes"].append(entry)
                            elif record.get("code_type") == "HCPCSCode":
                                results["hcpcs_codes"].append(entry)
                            found = True

                    # try :Procedure (singular — written by seedneo4j.py)
                    if not found:
                        query2 = """
                        MATCH (p:Procedure {name: $name})-[:BILLED_AS]->(code)
                        OPTIONAL MATCH (code)-[:REQUIRES_MODIFIER]->(m:Modifier)
                        RETURN labels(code)[0] AS code_type,
                               code.code      AS code_val,
                               collect(m.code) AS modifiers
                        """
                        for record in session.run(query2, name=proc):
                            cv = record.get("code_val")
                            if cv:
                                entry = {"procedure": proc, "code": cv, "modifiers": record.get("modifiers", [])}
                                if record.get("code_type") == "CPTCode":
                                    results["cpt_codes"].append(entry)
                                elif record.get("code_type") == "HCPCSCode":
                                    results["hcpcs_codes"].append(entry)
                                found = True

                    if not found:
                        logger.warning(f"No CPT/HCPCS code found in Neo4j for '{proc}'.")
                        results["not_found"]["procedures"].append(proc)

        except Exception as e:
            logger.error(f"Neo4j code lookup error: {e}")

        logger.info(
            f"fetch_codes_from_graph complete — "
            f"ICD: {len(results['icd_codes'])}, "
            f"CPT: {len(results['cpt_codes'])}, "
            f"HCPCS: {len(results['hcpcs_codes'])}, "
            f"not_found: {results['not_found']}"
        )
        return results