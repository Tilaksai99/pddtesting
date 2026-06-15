"""
reviewmodels.py
───────────────
SQLAlchemy model for the `pending_code_reviews` table.

ADD THIS to your existing backend/database.py  (or import it from here).

Table stores every AI-suggested ICD / CPT code that awaits human approval.

Lifecycle of a row
──────────────────
  pending   → human sees it on the review screen
  approved  → human clicked Approve (optionally editing the code first)
              → reviewroutes.py then calls neo4j_writer.push_approved_code()
  rejected  → human clicked Reject
              → row stays for audit but is never pushed to Neo4j

Column notes
────────────
  entity          : the raw extracted term  e.g. "cough", "Chest X-Ray"
  entity_type     : "diagnosis" | "procedure"   (drives which Neo4j label to use)
  suggested_code  : what Claude suggested      e.g. "R05.9"
  edited_code     : what the human changed it to (NULL if they accepted as-is)
  final_code      : derived at approval time = edited_code if set else suggested_code
  code_type       : "ICDCode" | "CPTCode" | "HCPCSCode"
  description     : human-readable code description from Claude
  confidence      : 0-100 integer from Claude
  reasoning       : one-line explanation from Claude
  status          : "pending" | "approved" | "rejected"
"""

from datetime import datetime

from sqlalchemy import (
    Column, DateTime, Integer, String, Text, func
)
from sqlalchemy.orm import declarative_base

# ── If you already have a Base in database.py, import that instead ─────────────
# from backend.database import Base
Base = declarative_base()   # remove this line if you import Base from elsewhere


class PendingCodeReview(Base):
    __tablename__ = "pending_code_reviews"

    id             = Column(String,   primary_key=True)          # UUID string
    report_id      = Column(String,   nullable=False, index=True) # FK → reports.id
    entity         = Column(String,   nullable=False)             # "cough"
    entity_type    = Column(String,   nullable=False)             # "diagnosis" | "procedure"
    suggested_code = Column(String,   nullable=False)             # "R05.9"
    edited_code    = Column(String,   nullable=True)              # human override
    code_type      = Column(String,   nullable=False)             # "ICDCode" | "CPTCode" | "HCPCSCode"
    description    = Column(Text,     nullable=True)              # "Cough, unspecified"
    confidence     = Column(Integer,  nullable=True)              # 0–100
    reasoning      = Column(Text,     nullable=True)              # Claude's one-liner
    status         = Column(String,   nullable=False, default="pending")  # pending/approved/rejected
    reject_reason  = Column(Text,     nullable=True)              # optional note on rejection
    created_at     = Column(DateTime, default=datetime.utcnow,    nullable=False)
    reviewed_at    = Column(DateTime, nullable=True)              # set when approved/rejected

    # ── Convenience property ───────────────────────────────────────────────────
    @property
    def final_code(self) -> str:
        """The code that will actually be pushed to Neo4j — edited wins over suggested."""
        return (self.edited_code or "").strip() or self.suggested_code


# ── Alembic-free helper: call once at startup to create the table if missing ──

def create_review_table_if_missing(engine):
    """
    Safe to call every startup. Checks existence before creating.
    Use this if you are NOT using Alembic migrations.

    Example usage in main.py / app startup:
        from backend.reviewmodels import create_review_table_if_missing
        from backend.database import engine
        create_review_table_if_missing(engine) 
    """
    Base.metadata.create_all(bind=engine, checkfirst=True)