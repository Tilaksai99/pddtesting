"""
seed_neo4j.py
─────────────
Pre-populates Neo4j with billing code data from:
  • diagnosis_icd_mapping.csv   → Diagnosis -[:MAPS_TO]-> ICDCode
  • procedure_cpt_mapping.csv   → Procedure -[:BILLED_AS]-> CPTCode / HCPCSCode
                                  CPTCode   -[:REQUIRES_MODIFIER]-> Modifier  (if modifier present)

Usage:
    python seed_neo4j.py

Environment variables (or .env file):
    NEO4J_URI       default: bolt://localhost:7687
    NEO4J_USER      default: neo4j
    NEO4J_PASSWORD  default: password
"""

import csv
import logging
import os
import sys
import time
import functools

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger(__name__)

# ── Optional .env support ──────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
    logger.info(".env loaded.")
except ImportError:
    pass

# ── Neo4j driver ───────────────────────────────────────────────────────────────
try:
    from neo4j import GraphDatabase
    from neo4j.exceptions import DatabaseUnavailable, TransientError, ServiceUnavailable
except ImportError:
    logger.error("neo4j driver not found.  Run:  pip install neo4j")
    sys.exit(1)

# ── Config ─────────────────────────────────────────────────────────────────────
NEO4J_URI      = os.environ.get("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER     = os.environ.get("NEO4J_USER",     "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "password")

DIAGNOSIS_CSV  = os.environ.get("DIAGNOSIS_CSV",  "diagnosis_icd_mapping.csv")
PROCEDURE_CSV  = os.environ.get("PROCEDURE_CSV",  "procedure_cpt_mapping.csv")

# Retry settings
DB_READY_TIMEOUT_S  = 60   # seconds to wait for DB to become available
DB_READY_INTERVAL_S = 3    # seconds between readiness probes
QUERY_MAX_RETRIES   = 5    # per-query retry attempts
QUERY_RETRY_DELAY_S = 2    # initial backoff delay (doubles each attempt)

# ── Helpers ────────────────────────────────────────────────────────────────────

def read_csv_unique(path: str) -> list[dict]:
    """Read a CSV and return deduplicated rows (strips Windows CR)."""
    seen = set()
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            clean = {k.strip(): v.strip() for k, v in row.items()}
            key = tuple(clean.values())
            if key not in seen:
                seen.add(key)
                rows.append(clean)
    logger.info(f"  {path}: {len(rows)} unique rows loaded.")
    return rows


def wait_for_db(driver, timeout: int = DB_READY_TIMEOUT_S, interval: int = DB_READY_INTERVAL_S):
    """
    Block until Neo4j's default database is ready to accept queries,
    or raise RuntimeError after `timeout` seconds.
    """
    deadline = time.monotonic() + timeout
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        try:
            with driver.session() as session:
                session.run("RETURN 1").consume()
            logger.info(f"  Database ready ✓  (after {attempt} probe(s))")
            return
        except (DatabaseUnavailable, TransientError, ServiceUnavailable) as e:
            remaining = int(deadline - time.monotonic())
            logger.warning(
                f"  DB not ready yet (attempt {attempt}, {remaining}s left): "
                f"{type(e).__name__} — retrying in {interval}s …"
            )
            time.sleep(interval)
        except Exception as e:
            # Unexpected error — don't loop forever
            raise
    raise RuntimeError(
        f"Neo4j database did not become available within {timeout} seconds. "
        "Check your Neo4j logs and ensure the DBMS is running."
    )


def run_with_retry(session, query: str, params: dict, max_retries: int = QUERY_MAX_RETRIES):
    """
    Execute a Cypher query, retrying on transient DatabaseUnavailable errors
    with exponential backoff.
    """
    delay = QUERY_RETRY_DELAY_S
    for attempt in range(1, max_retries + 1):
        try:
            session.run(query, **params).consume()
            return
        except (DatabaseUnavailable, TransientError) as e:
            if attempt == max_retries:
                logger.error(f"  Query failed after {max_retries} attempts: {e}")
                raise
            logger.warning(
                f"  Transient error on attempt {attempt}/{max_retries}: "
                f"{type(e).__name__} — retrying in {delay}s …"
            )
            time.sleep(delay)
            delay *= 2  # exponential backoff


def create_indexes(session):
    """Create uniqueness constraints so MERGE is fast and idempotent."""
    constraints = [
        ("Diagnosis", "name"),
        ("ICDCode",   "code"),
        ("Procedure", "name"),
        ("CPTCode",   "code"),
        ("HCPCSCode", "code"),
        ("Modifier",  "code"),
    ]
    for label, prop in constraints:
        try:
            run_with_retry(
                session,
                f"CREATE CONSTRAINT {label.lower()}_{prop}_unique IF NOT EXISTS "
                f"FOR (n:{label}) REQUIRE n.{prop} IS UNIQUE",
                {}
            )
            logger.info(f"  Constraint ready: {label}.{prop}")
        except Exception as e:
            logger.warning(f"  Could not create constraint {label}.{prop}: {e}")


def seed_diagnoses(session, rows: list[dict]) -> tuple[int, int]:
    """
    Merge Diagnosis and ICDCode nodes, then link with MAPS_TO.
    Returns (nodes_merged, relationships_merged).
    """
    nodes = rels = 0
    for row in rows:
        name = row.get("diagnosis_name", "").strip()
        code = row.get("icd_code", "").strip()
        if not name or not code:
            continue

        run_with_retry(
            session,
            """
            MERGE (d:Diagnosis {name: $name})
            MERGE (i:ICDCode   {code: $code})
            MERGE (d)-[:MAPS_TO]->(i)
            """,
            {"name": name, "code": code}
        )
        nodes += 2
        rels  += 1

    return nodes, rels


def seed_procedures(session, rows: list[dict]) -> tuple[int, int]:
    """
    Merge Procedure and CPTCode/HCPCSCode nodes, link with BILLED_AS.
    If a modifier exists, also create: code -[:REQUIRES_MODIFIER]-> Modifier.
    Returns (nodes_merged, relationships_merged).
    """
    nodes = rels = 0
    for row in rows:
        name      = row.get("procedure_name", "").strip()
        code_type = row.get("code_type",      "").strip()   # CPTCode | HCPCSCode
        code      = row.get("code",           "").strip()
        modifier  = row.get("modifier",       "").strip()

        if not name or not code_type or not code:
            continue
        if code_type not in ("CPTCode", "HCPCSCode"):
            logger.warning(f"  Unknown code_type '{code_type}' for '{name}' — skipping.")
            continue

        run_with_retry(
            session,
            f"""
            MERGE (p:Procedure  {{name: $name}})
            MERGE (c:{code_type} {{code: $code}})
            MERGE (p)-[:BILLED_AS]->(c)
            """,
            {"name": name, "code": code}
        )
        nodes += 2
        rels  += 1

        if modifier:
            run_with_retry(
                session,
                f"""
                MATCH (c:{code_type} {{code: $code}})
                MERGE (m:Modifier {{code: $modifier}})
                MERGE (c)-[:REQUIRES_MODIFIER]->(m)
                """,
                {"code": code, "modifier": modifier}
            )
            nodes += 1
            rels  += 1

    return nodes, rels


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    logger.info("=" * 55)
    logger.info("Neo4j Medical Billing Seeder")
    logger.info("=" * 55)

    # ── Validate CSV paths ─────────────────────────────────────────────────────
    for path in (DIAGNOSIS_CSV, PROCEDURE_CSV):
        if not os.path.exists(path):
            logger.error(f"CSV not found: {path}")
            logger.error("Set DIAGNOSIS_CSV / PROCEDURE_CSV env vars or run from the same folder.")
            sys.exit(1)

    # ── Connect ────────────────────────────────────────────────────────────────
    logger.info(f"Connecting to Neo4j at {NEO4J_URI} ...")
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        driver.verify_connectivity()
        logger.info("Connected ✓")
    except Exception as e:
        logger.error(f"Connection failed: {e}")
        sys.exit(1)

    # ── Wait for DB to be query-ready ──────────────────────────────────────────
    logger.info(f"\nWaiting for database to be ready (up to {DB_READY_TIMEOUT_S}s) ...")
    try:
        wait_for_db(driver)
    except RuntimeError as e:
        logger.error(str(e))
        driver.close()
        sys.exit(1)

    # ── Read CSVs ──────────────────────────────────────────────────────────────
    logger.info("\nReading CSVs ...")
    diag_rows = read_csv_unique(DIAGNOSIS_CSV)
    proc_rows = read_csv_unique(PROCEDURE_CSV)

    # ── Seed ───────────────────────────────────────────────────────────────────
    with driver.session() as session:
        logger.info("\nCreating indexes / constraints ...")
        create_indexes(session)

        logger.info("\nSeeding diagnoses → ICD codes ...")
        d_nodes, d_rels = seed_diagnoses(session, diag_rows)
        logger.info(f"  Done — ~{d_nodes} node merges, {d_rels} MAPS_TO relationships.")

        logger.info("\nSeeding procedures → CPT / HCPCS codes ...")
        p_nodes, p_rels = seed_procedures(session, proc_rows)
        logger.info(f"  Done — ~{p_nodes} node merges, {p_rels} BILLED_AS / REQUIRES_MODIFIER relationships.")

    driver.close()

    logger.info("\n" + "=" * 55)
    logger.info("Seeding complete ✓")
    logger.info(f"  Diagnosis rows  : {len(diag_rows)}")
    logger.info(f"  Procedure rows  : {len(proc_rows)}")
    logger.info(f"  Total node ops  : {d_nodes + p_nodes}")
    logger.info(f"  Total rel ops   : {d_rels  + p_rels}")
    logger.info("=" * 55)


if __name__ == "__main__":
    main()