"""
reviewroutes.py
───────────────
FastAPI router exposing the human review queue for AI-suggested billing codes.

Mount in your main app:
    from backend.routers.reviewroutes import router as review_router
    app.include_router(review_router, prefix="/api", tags=["code-review"])

Endpoints
─────────
  GET    /reviews/pending              → list all pending reviews (optionally filter by report)
  GET    /reviews/{id}                 → single review detail
  PATCH  /reviews/{id}/approve         → approve (with optional edited code)
  PATCH  /reviews/{id}/reject          → reject with a reason
  GET    /reports/{report_id}/reviews  → all reviews for a specific report
"""

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.database import PendingCodeReview
from backend.neo4j_writer import push_approved_code

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ReviewOut(BaseModel):
    """Shape returned to the frontend for every review item."""
    id:             str
    report_id:      str
    entity:         str
    entity_type:    str          # "diagnosis" | "procedure"
    suggested_code: str
    edited_code:    Optional[str]
    final_code:     str          # edited_code if set, else suggested_code
    code_type:      str          # "ICDCode" | "CPTCode" | "HCPCSCode"
    description:    Optional[str]
    confidence:     Optional[int]
    reasoning:      Optional[str]
    status:         str          # "pending" | "approved" | "rejected"
    reject_reason:  Optional[str]
    created_at:     str
    reviewed_at:    Optional[str]

    class Config:
        from_attributes = True


class ApproveRequest(BaseModel):
    edited_code: Optional[str] = None   # human can override the AI's code before approving


class RejectRequest(BaseModel):
    reason: Optional[str] = "No reason provided."


# ── Helper ────────────────────────────────────────────────────────────────────

def _row_to_out(row: PendingCodeReview) -> ReviewOut:
    return ReviewOut(
        id             = row.id,
        report_id      = row.report_id,
        entity         = row.entity,
        entity_type    = row.entity_type,
        suggested_code = row.suggested_code,
        edited_code    = row.edited_code,
        final_code     = row.final_code,
        code_type      = row.code_type,
        description    = row.description,
        confidence     = row.confidence,
        reasoning      = row.reasoning,
        status         = row.status,
        reject_reason  = row.reject_reason,
        created_at     = row.created_at.isoformat() if row.created_at else "",
        reviewed_at    = row.reviewed_at.isoformat() if row.reviewed_at else None,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/reviews/pending", response_model=List[ReviewOut])
def list_pending_reviews(
    report_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Returns all pending reviews, optionally filtered to a single report.
    Frontend calls this to populate the review queue screen.
    """
    query = db.query(PendingCodeReview).filter(PendingCodeReview.status == "pending")
    if report_id:
        query = query.filter(PendingCodeReview.report_id == report_id)
    rows = query.order_by(PendingCodeReview.created_at.desc()).all()
    return [_row_to_out(r) for r in rows]


@router.get("/reviews/{review_id}", response_model=ReviewOut)
def get_review(review_id: str, db: Session = Depends(get_db)):
    """Returns a single review item by ID."""
    row = db.query(PendingCodeReview).filter(PendingCodeReview.id == review_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Review not found.")
    return _row_to_out(row)


@router.patch("/reviews/{review_id}/approve")
def approve_review(
    review_id: str,
    body: ApproveRequest,
    db: Session = Depends(get_db),
):
    """
    Human approves an AI suggestion (optionally editing the code first).

    Steps:
      1. Validate the review exists and is still pending.
      2. If human supplied edited_code, store it.
      3. Derive final_code (edited_code or suggested_code).
      4. Push final_code into Neo4j via neo4j_writer.
      5. Mark row as approved.
    """
    row = db.query(PendingCodeReview).filter(PendingCodeReview.id == review_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Review not found.")
    if row.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Review is already '{row.status}'. Only pending reviews can be approved.",
        )

    # Store any human edit
    if body.edited_code and body.edited_code.strip():
        row.edited_code = body.edited_code.strip().upper()

    final = row.final_code  # uses the property (edited_code or suggested_code)

    # ── Push to Neo4j ─────────────────────────────────────────────────────────
    neo4j_result = push_approved_code(
        entity      = row.entity,
        entity_type = row.entity_type,
        final_code  = final,
        code_type   = row.code_type,
        description = row.description,
    )

    if neo4j_result["status"] == "error":
        # Don't mark as approved if the graph write failed — let the human retry
        logger.error(f"Neo4j write failed for review {review_id}: {neo4j_result['message']}")
        raise HTTPException(
            status_code=500,
            detail=f"Code approved but Neo4j write failed: {neo4j_result['message']}",
        )

    # ── Mark approved ─────────────────────────────────────────────────────────
    row.status      = "approved"
    row.reviewed_at = datetime.utcnow()
    db.commit()

    logger.info(
        f"Review {review_id} approved — "
        f"entity='{row.entity}', final_code='{final}', "
        f"neo4j='{neo4j_result['message']}'"
    )

    return {
        "status":       "success",
        "review_id":    review_id,
        "entity":       row.entity,
        "final_code":   final,
        "code_type":    row.code_type,
        "neo4j_result": neo4j_result,
        "message":      f"'{row.entity}' → '{final}' approved and written to Neo4j.",
    }


@router.patch("/reviews/{review_id}/reject")
def reject_review(
    review_id: str,
    body: RejectRequest,
    db: Session = Depends(get_db),
):
    """
    Human rejects an AI suggestion.
    Row is kept for audit purposes but never pushed to Neo4j.
    """
    row = db.query(PendingCodeReview).filter(PendingCodeReview.id == review_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Review not found.")
    if row.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Review is already '{row.status}'.",
        )

    row.status        = "rejected"
    row.reject_reason = body.reason
    row.reviewed_at   = datetime.utcnow()
    db.commit()

    logger.info(f"Review {review_id} rejected — entity='{row.entity}', reason='{body.reason}'")

    return {
        "status":    "success",
        "review_id": review_id,
        "entity":    row.entity,
        "message":   f"'{row.entity}' suggestion rejected. Reason: {body.reason}",
    }


@router.get("/reports/{report_id}/reviews", response_model=List[ReviewOut])
def get_reviews_for_report(report_id: str, db: Session = Depends(get_db)):
    """
    Returns ALL reviews (pending + approved + rejected) for a specific report.
    Frontend uses this on the report detail screen to show the full AI review history.
    """
    rows = (
        db.query(PendingCodeReview)
        .filter(PendingCodeReview.report_id == report_id)
        .order_by(PendingCodeReview.created_at.asc())
        .all()
    )
    return [_row_to_out(r) for r in rows]