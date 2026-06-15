"""
upload.py  (updated — AI fallback integrated)
─────────────────────────────────────────────
Changes from original:
  • After graph_db.fetch_codes_from_graph(), if any entities have no Neo4j code,
    the AI fallback is triggered automatically.
  • AI suggestions are saved as PendingCodeReview rows (status="pending").
  • The upload response now includes an "ai_suggestions" key and a
    "has_pending_reviews" flag so the frontend can show the review banner.
  • Everything else (extraction → normalization → graph → rules) is unchanged.
"""

import logging
import json
import uuid
from typing import Optional

from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from backend.database import get_db, Report
from backend.utils.auth import SECRET_KEY, ALGORITHM
from .extractionlayer import MedicalReportExtractor
from .normalizationlayer import MedicalNormalizer
from .graphlayer import MedicalKnowledgeGraph
from .ruleengine import ClinicalRuleEngine
from .ai_coding_fallback import get_ai_code_suggestions   # ← NEW 

logger = logging.getLogger(__name__)
router = APIRouter()

extractor   = MedicalReportExtractor()
normalizer  = MedicalNormalizer()
graph_db    = MedicalKnowledgeGraph()
rule_engine = ClinicalRuleEngine()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}
ALWAYS_ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
}
GENERIC_CONTENT_TYPES = {
    "application/octet-stream",
    "application/binary",
    "",
}

# In-memory store of resolved alert IDs.
# NOTE: This resets on server restart. For permanent persistence, add a
# `resolved_alerts` (Text/JSON) column to the Report model in database.py
# and store/load the resolved alert-id list there instead.
_RESOLVED_ALERT_IDS: set = set()

security = HTTPBearer(auto_error=False)

def get_current_user_id_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[str]:
    if not credentials:
        return None
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("user_id")
    except JWTError:
        return None


from pydantic import BaseModel

class FlagReportRequest(BaseModel):
    reason: str


def generate_clinical_summary(normalized_data: dict) -> str:
    symptoms    = normalized_data.get("symptoms", [])
    diagnoses   = normalized_data.get("diagnosis", [])
    medications = normalized_data.get("medications", [])
    procedures  = normalized_data.get("procedures", [])

    parts = []
    if diagnoses:
        parts.append(f"Patient assessed and diagnosed with {', '.join(diagnoses)}.")
    else:
        parts.append("Patient assessed for clinical evaluation.")
    if symptoms:
        parts.append(f"Presenting symptoms include {', '.join(symptoms)}.")
    if medications:
        parts.append(f"Current pharmacotherapy plan consists of {', '.join(medications)}.")
    if procedures:
        parts.append(f"Diagnostic or therapeutic procedures scheduled/completed: {', '.join(procedures)}.")
    if not parts:
        return (
            "Clinical report uploaded. Evaluation completed with no significant "
            "diagnoses or symptoms extracted."
        )
    return " ".join(parts)


def _validate_file_type(filename: str, content_type: str) -> None:
    clean_name = (filename or "").split("?")[0].strip().lower()
    ext = ""
    if "." in clean_name:
        candidate = clean_name.rsplit(".", 1)[-1]
        if candidate:
            ext = "." + candidate
    ct = (content_type or "").lower().split(";")[0].strip()
    logger.info(f"File validation → filename='{filename}' ext='{ext}' content_type='{ct}'")
    if ext in ALLOWED_EXTENSIONS:
        return
    if ct in ALWAYS_ALLOWED_CONTENT_TYPES:
        return
    raise HTTPException(
        status_code=400,
        detail=(
            f"Unsupported file type. "
            f"Received extension='{ext}', content_type='{ct}'. "
            "Accepted formats: PDF (.pdf), Word (.docx / .doc), plain text (.txt)."
        ),
    )


# ─── Upload ───────────────────────────────────────────────────────────────────

@router.post("/reports/upload")
@router.post("/upload")
async def upload_medical_report(
    file: UploadFile = File(...),
    report_type: str = Form("auto"),
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user_id_optional),
):
    safe_filename     = (file.filename     or "unknown").strip()
    safe_content_type = (file.content_type or "").strip()

    _validate_file_type(safe_filename, safe_content_type)

    content = await file.read()

    # ── 1. Extract ────────────────────────────────────────────────────────────
    extracted_data = extractor.process_document(
        file_bytes=content,
        filename=safe_filename,
        content_type=safe_content_type,
    )

    raw_text = ""
    try:
        raw_text = extractor._extract_text(content, safe_content_type, safe_filename)
    except Exception as e:
        logger.warning(f"Could not capture raw text separately: {e}")

    # ── 2. Normalize ──────────────────────────────────────────────────────────
    normalized_data = normalizer.normalize(extracted_data)

    # ── 3. Build patient graph ────────────────────────────────────────────────
    patient_id    = user_id or "PATIENT_12345"
    graph_summary = graph_db.build_patient_graph(patient_id, normalized_data)

    # ── 4. Fetch codes from graph ─────────────────────────────────────────────
    graph_codes = graph_db.fetch_codes_from_graph(normalized_data)

    # ── 5. Apply rules ────────────────────────────────────────────────────────
    rule_results = rule_engine.apply_rules(normalized_data, graph_codes)

    # ── 6. Persist to PostgreSQL (need report_id before AI call) ─────────────
    report_id = str(uuid.uuid4())
    db_report = Report(
        id                 = report_id,
        user_id            = user_id,
        filename           = safe_filename,
        report_type        = report_type if report_type != "auto" else "Auto-detect",
        content_type       = safe_content_type or None,
        raw_text           = raw_text,
        extracted_data     = json.dumps(extracted_data),
        normalized_data    = json.dumps(normalized_data),
        graph_summary      = json.dumps(graph_summary),
        rule_engine_results= json.dumps(rule_results),
        is_flagged         = False,
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)

    # ── 7. AI fallback for missing codes ──────────────────────────────────────
    not_found = graph_codes.get("not_found", {"diagnoses": [], "procedures": []})
    has_missing = bool(not_found.get("diagnoses") or not_found.get("procedures"))

    ai_suggestions: dict = {"icd_suggestions": [], "cpt_suggestions": [], "pending_review_ids": []}

    if has_missing:
        logger.info(
            f"Triggering AI fallback for report {report_id} — "
            f"missing: {not_found}"
        )
        ai_suggestions = get_ai_code_suggestions(
            not_found = not_found,
            raw_text  = raw_text,
            report_id = report_id,
            db        = db,
        )

    return {
        "report_id":           report_id,
        "id":                  report_id,
        "filename":            safe_filename,
        "report_type":         report_type,
        "content_type":        safe_content_type,
        "size":                len(content),
        "has_pending_reviews": has_missing,          # ← frontend shows review banner
        "message":             (
            "Report processed. Some codes require human review."
            if has_missing else
            "Diagnosis report processed and saved to database successfully."
        ),
        "data": {
            "raw_extraction":      extracted_data,
            "normalized_data":     normalized_data,
            "graph_summary":       graph_summary,
            "rule_engine_results": rule_results,
            "ai_suggestions":      ai_suggestions,   # ← pending review items
        },
    }


# ─── Results ──────────────────────────────────────────────────────────────────

@router.get("/reports/{report_id}/results")
async def get_report_results(report_id: str, db: Session = Depends(get_db)):
    db_report = db.query(Report).filter(Report.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")

    extracted_data  = json.loads(db_report.extracted_data       or "{}")
    normalized_data = json.loads(db_report.normalized_data      or "{}")
    rule_results    = json.loads(db_report.rule_engine_results   or "{}")

    icd_codes = rule_results.get("icd_codes", [])
    cpt_codes = rule_results.get("cpt_codes", [])

    icd10_list = []
    cpt_list   = []

    for item in icd_codes:
        diag = item.get("diagnosis")
        code = item.get("code")
        conf = extracted_data.get("confidence_scores", {}).get(diag, 0.0)
        icd10_list.append({"code": code, "description": diag, "confidence": int(conf)})

    for item in cpt_codes:
        proc = item.get("procedure")
        code = item.get("code")
        conf = extracted_data.get("confidence_scores", {}).get(proc, 0.0)
        cpt_list.append({"code": code, "description": proc, "confidence": int(conf)})

    flags = []
    for alert in rule_results.get("clinical_alerts", []):
        flags.append(alert.get("message"))
    for flag_item in rule_results.get("insurance_flags", []):
        flags.append(flag_item.get("message"))

    summary_text = generate_clinical_summary(normalized_data)
    analysed_at  = "Today, " + db_report.created_at.strftime("%I:%M %p")

    return {
        "filename":    db_report.filename,
        "report_type": db_report.report_type,
        "analysed_at": analysed_at,
        "summary":     summary_text,
        "icd10":       icd10_list,
        "cpt":         cpt_list,
        "flags":       flags,
    }


# ─── History ──────────────────────────────────────────────────────────────────

@router.get("/reports/history")
async def get_reports_history(
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user_id_optional),
):
    """
    Returns every processed report for the logged-in user (or all reports if
    unauthenticated/no user_id) in the shape the History screen expects:
        { id, filename, type, date, codes, status, alerts }
    """
    query = db.query(Report)
    if user_id:
        query = query.filter(Report.user_id == user_id)
    reports = query.order_by(Report.created_at.desc()).all()

    history = []
    for r in reports:
        rule_results = json.loads(r.rule_engine_results or "{}")

        codes_count = (
            len(rule_results.get("icd_codes", []))
            + len(rule_results.get("cpt_codes", []))
            + len(rule_results.get("hcpcs_codes", []))
        )
        alerts_count = (
            len(rule_results.get("clinical_alerts", []))
            + len(rule_results.get("insurance_flags", []))
        )

        history.append({
            "id":       r.id,
            "filename": r.filename,
            "type":     r.report_type or "Auto-detect",
            "date":     r.created_at.strftime("%d %b, %I:%M %p") if r.created_at else "",
            "codes":    codes_count,
            "status":   "alert" if alerts_count > 0 else "done",
            "alerts":   alerts_count,
        })

    return {"reports": history}


# ─── Alerts ───────────────────────────────────────────────────────────────────

@router.get("/reports/alerts")
async def get_reports_alerts(
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user_id_optional),
):
    """
    Flattens clinical_alerts + insurance_flags from every report's
    rule_engine_results into individual alert objects for the Alerts screen:
        { id, reportId, filename, type, message, severity, createdAt, resolved }
    """
    query = db.query(Report)
    if user_id:
        query = query.filter(Report.user_id == user_id)
    reports = query.order_by(Report.created_at.desc()).all()

    alerts = []
    for r in reports:
        rule_results = json.loads(r.rule_engine_results or "{}")
        created_str  = r.created_at.strftime("%d %b, %I:%M %p") if r.created_at else ""

        # Clinical alerts (e.g. contraindications) → "danger"
        for i, alert in enumerate(rule_results.get("clinical_alerts", [])):
            alert_id = f"{r.id}-clinical-{i}"
            alerts.append({
                "id":        alert_id,
                "reportId":  r.id,
                "filename":  r.filename,
                "type":      alert.get("rule", "Clinical Alert").replace("_", " ").title(),
                "message":   alert.get("message", ""),
                "severity":  "danger",
                "createdAt": created_str,
                "resolved":  alert_id in _RESOLVED_ALERT_IDS,
            })

        # Insurance / pre-auth flags → "warning"
        for i, flag in enumerate(rule_results.get("insurance_flags", [])):
            alert_id = f"{r.id}-insurance-{i}"
            alerts.append({
                "id":        alert_id,
                "reportId":  r.id,
                "filename":  r.filename,
                "type":      flag.get("rule", "Insurance Flag").replace("_", " ").title(),
                "message":   flag.get("message", ""),
                "severity":  "warning",
                "createdAt": created_str,
                "resolved":  alert_id in _RESOLVED_ALERT_IDS,
            })

    return {"alerts": alerts}


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str):
    """
    Marks an alert as resolved so it's hidden from the "Active" list.

    Alert IDs are synthetic (`{report_id}-clinical-{i}` /
    `{report_id}-insurance-{i}`), generated on the fly in /reports/alerts,
    so resolution state is tracked here in-memory rather than via a
    foreign-keyed table.
    """
    _RESOLVED_ALERT_IDS.add(alert_id)
    return {
        "status":   "success",
        "alert_id": alert_id,
        "resolved": True,
    }


# ─── Dashboard Stats ──────────────────────────────────────────────────────────

@router.get("/reports/stats")
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user_id_optional),
):
    """
    Returns stat card data for the Dashboard screen:
        { reports_today, reports_today_delta, codes_found, active_alerts, pre_auth_flags }
    """
    from datetime import date, timedelta

    query = db.query(Report)
    if user_id:
        query = query.filter(Report.user_id == user_id)
    reports = query.order_by(Report.created_at.desc()).all()

    today      = date.today()
    yesterday  = today - timedelta(days=1)

    reports_today     = 0
    reports_yesterday = 0
    codes_found       = 0
    active_alerts     = 0
    pre_auth_flags    = 0

    for r in reports:
        rule_results = json.loads(r.rule_engine_results or "{}")
        report_date  = r.created_at.date() if r.created_at else None

        codes = (
            len(rule_results.get("icd_codes",     []))
            + len(rule_results.get("cpt_codes",   []))
            + len(rule_results.get("hcpcs_codes", []))
        )
        clinical_alerts  = len(rule_results.get("clinical_alerts",  []))
        insurance_flags  = len(rule_results.get("insurance_flags",  []))

        codes_found    += codes
        active_alerts  += clinical_alerts
        pre_auth_flags += insurance_flags

        if report_date == today:
            reports_today += 1
        elif report_date == yesterday:
            reports_yesterday += 1

    return {
        "reports_today":       reports_today,
        "reports_today_delta": reports_today - reports_yesterday,
        "codes_found":         codes_found,
        "active_alerts":       active_alerts,
        "pre_auth_flags":      pre_auth_flags,
    }


# ─── User Stats (Profile screen) ──────────────────────────────────────────────

@router.get("/reports/user-stats")
async def get_user_stats(
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user_id_optional),
):
    """
    Returns this-month activity for the Profile screen:
        { reports_total, codes_generated, accuracy, hours_saved }
    """
    from datetime import date

    query = db.query(Report)
    if user_id:
        query = query.filter(Report.user_id == user_id)

    today = date.today()
    reports = [
        r for r in query.all()
        if r.created_at and r.created_at.year == today.year and r.created_at.month == today.month
    ]

    reports_total   = len(reports)
    codes_generated = 0
    confidence_sum  = 0
    confidence_cnt  = 0

    for r in reports:
        rule_results    = json.loads(r.rule_engine_results or "{}")
        extracted_data  = json.loads(r.extracted_data or "{}")

        icd_codes  = rule_results.get("icd_codes",   [])
        cpt_codes  = rule_results.get("cpt_codes",   [])
        hcpcs_codes= rule_results.get("hcpcs_codes", [])
        codes_generated += len(icd_codes) + len(cpt_codes) + len(hcpcs_codes)

        conf_scores = extracted_data.get("confidence_scores", {})
        for v in conf_scores.values():
            try:
                confidence_sum += float(v)
                confidence_cnt += 1
            except (TypeError, ValueError):
                pass

    accuracy    = round(confidence_sum / confidence_cnt) if confidence_cnt else 0
    # Rough heuristic: each report saves ~15 min of manual coding time
    hours_saved = round(reports_total * 0.25, 1)

    return {
        "reports_total":   reports_total,
        "codes_generated": codes_generated,
        "accuracy":        accuracy,
        "hours_saved":     hours_saved,
    }


# ─── Flag ─────────────────────────────────────────────────────────────────────

@router.post("/reports/{report_id}/flag")
async def flag_report_for_review(
    report_id: str,
    body: FlagReportRequest,
    db: Session = Depends(get_db),
):
    db_report = db.query(Report).filter(Report.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")

    db_report.is_flagged  = True
    db_report.flag_reason = body.reason
    db.commit()

    return {
        "status":  "success",
        "message": f"Report successfully flagged for review. Reason: {body.reason}",
    }