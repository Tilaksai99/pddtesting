"""
neo4j_writer.py
───────────────
Writes a single human-approved ICD / CPT / HCPCS code into Neo4j.

Called exclusively from reviewroutes.py after a human clicks "Approve".

Neo4j schema this file targets (from your live DB):
──────────────────────────────────────────────────────────────────
  (:Diagnosis  {name})  -[:MAPS_TO]->   (:ICDCode   {code})
  (:Procedure  {name})  -[:BILLED_AS]-> (:CPTCode   {code})
  (:Procedure  {name})  -[:BILLED_AS]-> (:HCPCSCode {code})
──────────────────────────────────────────────────────────────────

Note: build_patient_graph() in graphlayer.py writes patient-level nodes
with labels :Diagnosis, :Symptoms, :Procedures (plural).
The billing ontology (seeded by seedneo4j.py) uses :Diagnosis and :Procedure
(singular) for code lookup.

This writer uses :Diagnosis / :Procedure (singular) so new entries are
immediately discoverable by fetch_codes_from_graph().
"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from neo4j import GraphDatabase
    HAS_NEO4J = True
except ImportError:
    HAS_NEO4J = False
    logger.error("neo4j driver not installed — approved codes cannot be written to graph.")


def _get_driver():
    """Create a fresh Neo4j driver using env vars (same pattern as graphlayer.py)."""
    if not HAS_NEO4J:
        return None
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    uri      = os.environ.get("NEO4J_URI",      "bolt://localhost:7687")
    user     = os.environ.get("NEO4J_USER",     "neo4j")
    password = os.environ.get("NEO4J_PASSWORD", "password")

    try:
        driver = GraphDatabase.driver(uri, auth=(user, password))
        driver.verify_connectivity()
        return driver
    except Exception as e:
        logger.error(f"Neo4j connection failed in neo4j_writer: {e}")
        return None


def push_approved_code(
    entity: str,
    entity_type: str,       # "diagnosis" | "procedure"
    final_code: str,
    code_type: str,         # "ICDCode" | "CPTCode" | "HCPCSCode"
    description: Optional[str] = None,
) -> dict:
    """
    Merge the approved entity + code into Neo4j and create the linking relationship.

    Returns
    -------
    {"status": "success", "message": "..."}   on success
    {"status": "error",   "message": "..."}   on failure
    """
    if not entity or not final_code or not code_type:
        return {"status": "error", "message": "entity, final_code, and code_type are required."}

    driver = _get_driver()
    if not driver:
        return {"status": "error", "message": "Neo4j is not available."}

    try:
        with driver.session() as session:

            # ── DIAGNOSIS → ICDCode ───────────────────────────────────────────
            if entity_type == "diagnosis" and code_type == "ICDCode":
                query = """
                MERGE (d:Diagnosis {name: $entity})
                MERGE (i:ICDCode   {code: $code})
                ON CREATE SET i.description = $description
                MERGE (d)-[:MAPS_TO]->(i)
                """
                session.run(query, entity=entity, code=final_code, description=description or "")
                msg = f"Diagnosis '{entity}' → ICDCode '{final_code}' written to Neo4j."

            # ── PROCEDURE → CPTCode ───────────────────────────────────────────
            elif entity_type == "procedure" and code_type == "CPTCode":
                query = """
                MERGE (p:Procedure {name: $entity})
                MERGE (c:CPTCode   {code: $code})
                ON CREATE SET c.description = $description
                MERGE (p)-[:BILLED_AS]->(c)
                """
                session.run(query, entity=entity, code=final_code, description=description or "")
                msg = f"Procedure '{entity}' → CPTCode '{final_code}' written to Neo4j."

            # ── PROCEDURE → HCPCSCode ─────────────────────────────────────────
            elif entity_type == "procedure" and code_type == "HCPCSCode":
                query = """
                MERGE (p:Procedure  {name: $entity})
                MERGE (h:HCPCSCode  {code: $code})
                ON CREATE SET h.description = $description
                MERGE (p)-[:BILLED_AS]->(h)
                """
                session.run(query, entity=entity, code=final_code, description=description or "")
                msg = f"Procedure '{entity}' → HCPCSCode '{final_code}' written to Neo4j."

            else:
                return {
                    "status":  "error",
                    "message": f"Unhandled combination: entity_type='{entity_type}', code_type='{code_type}'.",
                }

        driver.close()
        logger.info(msg)
        return {"status": "success", "message": msg}

    except Exception as e:
        logger.error(f"Neo4j write failed for '{entity}' → '{final_code}': {e}")
        driver.close()
        return {"status": "error", "message": str(e)}