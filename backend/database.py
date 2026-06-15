import os
import logging
from datetime import datetime
from sqlalchemy import create_engine, text, Column, String, DateTime, Text, Boolean, Integer
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.sql import func
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# IMPORTANT: URL must use postgresql+psycopg2://
# Install driver if missing:  pip install psycopg2-binary
# ------------------------------------------------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:0909@localhost:5432/Medicalcoding"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,   # tests connection before using — prevents silent disconnects
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ------------------------------------------------------------------
# Users Table model — for reference only, table is created manually
# ------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    # Identity
    id           = Column(String,      primary_key=True)
    name         = Column(String(255), nullable=False)
    email        = Column(String(255), nullable=False, unique=True, index=True)
    password     = Column(String(255), nullable=False)
    phone        = Column(String(50),  nullable=True, default="")
    age          = Column(String(10),  nullable=True, default="")

    # Professional info
    organization = Column(String(255), nullable=True, default="")
    department   = Column(String(255), nullable=True, default="")
    role         = Column(String(255), nullable=True, default="")
    work_email   = Column(String(255), nullable=True, default="")

    # Device
    fcm_token    = Column(Text,        nullable=True, default="")

    # Timestamps
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(),
                          onupdate=func.now(), nullable=False)


# ------------------------------------------------------------------
# Reports Table model for real-time document analysis pipeline
# ------------------------------------------------------------------
class Report(Base):
    __tablename__ = "reports"

    id                  = Column(String, primary_key=True)
    user_id             = Column(String, nullable=True)
    filename            = Column(String(255), nullable=False)
    report_type         = Column(String(100), nullable=True, default="Auto-detect")
    content_type        = Column(String(100), nullable=True)
    raw_text            = Column(Text, nullable=True)

    # Serialized JSON data from extraction/normalization/graph/rules layers
    extracted_data      = Column(Text, nullable=True)
    normalized_data     = Column(Text, nullable=True)
    graph_summary       = Column(Text, nullable=True)
    rule_engine_results = Column(Text, nullable=True)

    # Flagging metadata
    is_flagged          = Column(Boolean, nullable=False, default=False)
    flag_reason         = Column(String(255), nullable=True)

    # Timestamps
    created_at          = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)



# ------------------------------------------------------------------
# PendingCodeReview — AI-suggested codes awaiting human approval
# ------------------------------------------------------------------
class PendingCodeReview(Base):
    __tablename__ = "pending_code_reviews"

    id             = Column(String,   primary_key=True)           # UUID string
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
    reject_reason  = Column(Text,     nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow,   nullable=False)
    reviewed_at    = Column(DateTime, nullable=True)

    @property
    def final_code(self) -> str:
        """The code pushed to Neo4j — human edit wins over AI suggestion."""
        return (self.edited_code or "").strip() or self.suggested_code


# ------------------------------------------------------------------
# FastAPI dependency
# ------------------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ------------------------------------------------------------------
# Connection checker — called at startup in main.py
# ------------------------------------------------------------------
def check_db_connection() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("✅ PostgreSQL connected successfully.")
        return True
    except Exception as e:
        logger.error(f"❌ PostgreSQL connection failed: {e}")
        logger.error("Check: is PostgreSQL running? Is DATABASE_URL correct in .env?")
        return False