import io
import logging
import re
from typing import Dict, List, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── PDF / DOCX extractors ──────────────────────────────────────────────────────
try:
    from pdfminer.high_level import extract_text as pdf_extract_text
    HAS_PDFMINER = True
except ImportError:
    logger.warning("pdfminer.six not installed. Run `pip install pdfminer.six`.")
    HAS_PDFMINER = False

try:
    from docx import Document as DocxDocument
    HAS_DOCX = True
except ImportError:
    logger.warning("python-docx not installed. Run `pip install python-docx`.")
    HAS_DOCX = False

# ── NER: GLiNER first, then HuggingFace ───────────────────────────────────────
HAS_GLINER = False
HAS_TRANSFORMERS = False
_ner_pipeline = None

def _load_ner_pipeline():
    global HAS_GLINER, HAS_TRANSFORMERS, _ner_pipeline

    if _ner_pipeline is not None:
        return _ner_pipeline

    try:
        from gliner import GLiNER
        _ner_pipeline = GLiNER.from_pretrained("urchade/gliner_mediumv2.1")
        HAS_GLINER = True
        logger.info("GLiNER medical NER loaded (urchade/gliner_mediumv2.1).")
        return _ner_pipeline
    except Exception as e:
        logger.warning(f"GLiNER unavailable ({e}). Trying HuggingFace transformers …")

    try:
        from transformers import pipeline as hf_pipeline
        _ner_pipeline = hf_pipeline(
            "token-classification",
            model="d4data/biomedical-ner-all",
            aggregation_strategy="simple",
        )
        HAS_TRANSFORMERS = True
        logger.info("HuggingFace NER loaded (d4data/biomedical-ner-all).")
        return _ner_pipeline
    except Exception as e:
        logger.warning(f"HuggingFace NER unavailable ({e}).")

    return None


# ── Medical abbreviation expansion ────────────────────────────────────────────
MEDICAL_ABBREVIATIONS = {
    r"\bHTN\b": "Hypertension",
    r"\bSOB\b": "Shortness of breath",
    r"\bpt\b":  "patient",
    r"\bRx\b":  "Prescription",
    r"\bDx\b":  "Diagnosis",
    r"\bTx\b":  "Treatment",
    r"\bHx\b":  "History",
    r"\bc/o\b": "complains of",
    r"\bN/V\b": "Nausea and Vomiting",
    r"\bDOB\b": "Date of Birth",
}

# ── Label mappings ─────────────────────────────────────────────────────────────
_GLINER_LABEL_MAP = {
    "disease":              "DISEASE",
    "symptom":              "DISEASE",
    "sign or symptom":      "DISEASE",
    "medication":           "CHEMICAL",
    "drug":                 "CHEMICAL",
    "chemical":             "CHEMICAL",
    "procedure":            "PROCEDURE",
    "test":                 "PROCEDURE",
    "diagnostic":           "PROCEDURE",
    "diagnostic procedure": "PROCEDURE",
    "anatomical location":  None,   # skip
}

_HF_LABEL_MAP = {
    "B-Disease":     "DISEASE",
    "I-Disease":     "DISEASE",
    "B-Chemical":    "CHEMICAL",
    "I-Chemical":    "CHEMICAL",
    "B-Gene":        None,
    "B-Species":     None,
    "B-DNAMutation": None,
}


class MedicalReportExtractor:
    def __init__(self):
        logger.info("MedicalReportExtractor initializing (NER loads on first use).")

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------
    def process_document(self, file_bytes: bytes, filename: str, content_type: str) -> Dict[str, Any]:
        """Extract → section-detect → expand abbrevs → NER → categorize.
        Returns empty categories if nothing could be extracted — never fake data.
        """
        full_text = self._extract_text(file_bytes, content_type, filename)

        if not full_text.strip():
            logger.warning(f"No text could be extracted from '{filename}'.")
            return self._empty_result()

        sections      = self._detect_sections(full_text)
        expanded_text = self._expand_abbreviations(full_text)
        entities      = self._extract_entities(expanded_text)
        categorized   = self._categorize_entities(entities)
        categorized["detected_sections"] = sections
        return categorized

    # ------------------------------------------------------------------
    # Empty result — honest "nothing found", no fake data
    # ------------------------------------------------------------------
    @staticmethod
    def _empty_result() -> Dict[str, Any]:
        return {
            "symptoms":          [],
            "diagnosis":         [],
            "procedures":        [],
            "medications":       [],
            "lab_findings":      [],
            "confidence_scores": {},
            "detected_sections": {},
        }

    # ------------------------------------------------------------------
    # Text extraction
    # ------------------------------------------------------------------
    def _extract_text(self, file_bytes: bytes, content_type: str, filename: str) -> str:
        fname_lower = filename.lower()
        ct_lower    = (content_type or "").lower()

        is_pdf  = "pdf" in ct_lower or fname_lower.endswith(".pdf")
        is_docx = ("wordprocessingml" in ct_lower or "msword" in ct_lower
                   or fname_lower.endswith(".docx") or fname_lower.endswith(".doc"))
        is_txt  = "text/plain" in ct_lower or fname_lower.endswith(".txt")

        if is_pdf:
            return self._extract_pdf(file_bytes)
        elif is_docx:
            return self._extract_docx(file_bytes)
        elif is_txt:
            return self._decode_txt(file_bytes)
        else:
            logger.warning(f"Unknown content type '{content_type}' for '{filename}'. Trying PDF then txt.")
            text = self._extract_pdf(file_bytes)
            return text if text.strip() else self._decode_txt(file_bytes)

    def _extract_pdf(self, file_bytes: bytes) -> str:
        if not HAS_PDFMINER:
            logger.error("pdfminer.six is not installed — cannot extract PDF text.")
            return ""
        try:
            text = pdf_extract_text(io.BytesIO(file_bytes))
            logger.info(f"PDF text extracted: {len(text)} characters.")
            return text or ""
        except Exception as e:
            logger.error(f"pdfminer extraction failed: {e}")
            return ""

    def _extract_docx(self, file_bytes: bytes) -> str:
        if not HAS_DOCX:
            logger.error("python-docx is not installed — cannot extract DOCX text.")
            return ""
        try:
            doc  = DocxDocument(io.BytesIO(file_bytes))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            logger.info(f"DOCX text extracted: {len(text)} characters.")
            return text
        except Exception as e:
            logger.error(f"python-docx extraction failed: {e}")
            return ""

    def _decode_txt(self, file_bytes: bytes) -> str:
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return file_bytes.decode("latin-1", errors="replace")

    # ------------------------------------------------------------------
    # Section detection
    # ------------------------------------------------------------------
    def _detect_sections(self, text: str) -> Dict[str, str]:
        sections: Dict[str, List[str]] = {}
        current = "General"
        sections[current] = []
        headers = [
            "DIAGNOSIS", "MEDICATIONS", "ALLERGIES", "LABORATORY RESULTS",
            "HISTORY OF PRESENT ILLNESS", "ASSESSMENT", "PLAN",
        ]
        for line in text.split("\n"):
            lu = line.strip().upper()
            matched = False
            for h in headers:
                if lu.startswith(h):
                    current = h
                    sections[current] = []
                    matched = True
                    break
            if not matched and line.strip():
                sections[current].append(line.strip())
        return {k: " ".join(v) for k, v in sections.items() if v}

    def _expand_abbreviations(self, text: str) -> str:
        for abbr, exp in MEDICAL_ABBREVIATIONS.items():
            text = re.sub(abbr, exp, text, flags=re.IGNORECASE)
        return text

    # ------------------------------------------------------------------
    # Entity validation — blocks noise before it reaches the graph
    # ------------------------------------------------------------------
    @staticmethod
    def _is_valid_entity(text: str) -> bool:
        """
        Rejects tokens that cannot be real medical entities:
          - purely numeric strings, including with separators (e.g. "8192", "23-27", "2179")
          - fewer than 3 characters
          - >50% digits
        """
        import re as _re
        text = text.strip()
        if len(text) < 3:
            return False
        # strip separators and check if what remains is purely numeric
        stripped = _re.sub(r"[\s\-/.,:]", "", text)
        if not stripped or stripped.isdigit():
            return False
        if sum(c.isdigit() for c in text) / len(text) > 0.5:
            return False
        return True

    # ------------------------------------------------------------------
    # NER
    # ------------------------------------------------------------------
    def _extract_entities(self, text: str) -> List[Dict[str, Any]]:
        pipe = _load_ner_pipeline()

        if pipe is not None and HAS_GLINER:
            return self._ner_gliner(pipe, text)

        if pipe is not None and HAS_TRANSFORMERS:
            return self._ner_transformers(pipe, text)

        # No NER model available — return nothing, not fake data
        logger.error("No NER model available. Cannot extract entities.")
        return []

    def _ner_gliner(self, model, text: str) -> List[Dict[str, Any]]:
        labels = [
            "disease", "symptom", "medication", "drug",
            "procedure", "test", "diagnostic procedure",
        ]
        try:
            raw = model.predict_entities(text, labels, threshold=0.4)
            logger.info(f"GLiNER raw output: {[(e['text'], e['label'], round(e.get('score',0)*100,1)) for e in raw]}")
            entities = []
            for ent in raw:
                internal = _GLINER_LABEL_MAP.get(ent["label"].lower())
                if internal is None:
                    continue
                if not self._is_valid_entity(ent["text"]):
                    logger.warning(f"GLiNER: rejected noise entity '{ent['text']}' (label={ent['label']})")
                    continue
                entities.append({
                    "text":             ent["text"],
                    "label":            internal,
                    "confidence_score": round(ent.get("score", 0.0) * 100, 2),
                })
            logger.info(f"GLiNER extracted {len(entities)} valid entities.")
            return entities
        except Exception as e:
            logger.error(f"GLiNER inference failed: {e}")
            return []

    def _ner_transformers(self, pipe, text: str) -> List[Dict[str, Any]]:
        try:
            chunk_size = 400
            words      = text.split()
            chunks     = [" ".join(words[i:i+chunk_size]) for i in range(0, len(words), chunk_size)]
            entities   = []
            seen       = set()
            for chunk in chunks:
                raw = pipe(chunk)
                for ent in raw:
                    word  = ent.get("word", "").replace("##", "").strip()
                    label = _HF_LABEL_MAP.get(ent.get("entity_group", ""))
                    if not label or not word or word in seen:
                        continue
                    if not self._is_valid_entity(word):
                        logger.debug(f"HF NER: skipping noise entity '{word}'")
                        continue
                    seen.add(word)
                    entities.append({
                        "text":             word,
                        "label":            label,
                        "confidence_score": round(ent.get("score", 0.0) * 100, 2),
                    })
            logger.info(f"HuggingFace NER extracted {len(entities)} valid entities.")
            return entities
        except Exception as e:
            logger.error(f"HuggingFace NER inference failed: {e}")
            return []

    # ------------------------------------------------------------------
    # Categorize
    # ------------------------------------------------------------------
    def _categorize_entities(self, entities: List[Dict[str, Any]]) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "symptoms":          [],
            "diagnosis":         [],
            "procedures":        [],
            "medications":       [],
            "lab_findings":      [],
            "confidence_scores": {},
        }
        seen: set = set()
        for ent in entities:
            label = ent.get("label", "")
            text  = ent.get("text",  "")
            score = ent.get("confidence_score", 0.0)
            if text in seen:
                continue
            seen.add(text)
            out["confidence_scores"][text] = score

            if label in ("DISEASE", "SYMPTOM"):
                out["symptoms"].append(text)
            elif label == "DIAGNOSIS":
                out["diagnosis"].append(text)
            elif label in ("CHEMICAL", "DRUG"):
                out["medications"].append(text)
            elif label == "PROCEDURE":
                out["procedures"].append(text)
            elif label == "LAB_FINDING":
                out["lab_findings"].append(text)
            # unknown labels are dropped — not silently dumped into lab_findings
        return out