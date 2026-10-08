import re
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict

from services.groq_rotation import groq_rotator

logger = logging.getLogger("ner_extractor")

# Canonical Sponsor Agency Mapping
SPONSOR_SYNONYMS = {
    # NSF
    "nsf": "National Science Foundation (NSF)",
    "national science foundation": "National Science Foundation (NSF)",
    "nat sci found": "National Science Foundation (NSF)",
    "national science foundation (nsf)": "National Science Foundation (NSF)",
    # NIH
    "nih": "National Institutes of Health (NIH)",
    "national institutes of health": "National Institutes of Health (NIH)",
    "natl inst of health": "National Institutes of Health (NIH)",
    "national institutes of health (nih)": "National Institutes of Health (NIH)",
    "niaid": "National Institutes of Health (NIH) - NIAID",
    "nci": "National Institutes of Health (NIH) - NCI",
    "nimh": "National Institutes of Health (NIH) - NIMH",
    # DOE
    "doe": "Department of Energy (DOE)",
    "dept of energy": "Department of Energy (DOE)",
    "department of energy": "Department of Energy (DOE)",
    "u.s. department of energy": "Department of Energy (DOE)",
    # DOD / DARPA / ONR
    "dod": "Department of Defense (DOD)",
    "dept of defense": "Department of Defense (DOD)",
    "department of defense": "Department of Defense (DOD)",
    "darpa": "Defense Advanced Research Projects Agency (DARPA)",
    "defense advanced research projects agency": "Defense Advanced Research Projects Agency (DARPA)",
    "onr": "Office of Naval Research (ONR)",
    "office of naval research": "Office of Naval Research (ONR)",
    "afosr": "Air Force Office of Scientific Research (AFOSR)",
    # NASA
    "nasa": "National Aeronautics and Space Administration (NASA)",
    "national aeronautics and space administration": "National Aeronautics and Space Administration (NASA)",
    # USDA
    "usda": "United States Department of Agriculture (USDA)",
    "united states department of agriculture": "United States Department of Agriculture (USDA)",
    # NEH / NEA
    "neh": "National Endowment for the Humanities (NEH)",
    "national endowment for the humanities": "National Endowment for the Humanities (NEH)",
    # ED
    "ed": "Department of Education (ED)",
    "dept of education": "Department of Education (ED)",
    "department of education": "Department of Education (ED)",
}

# Canonical Department Mapping
DEPARTMENT_SYNONYMS = {
    "cs": "Computer Science & Engineering",
    "computer science": "Computer Science & Engineering",
    "cse": "Computer Science & Engineering",
    "bio": "Biological Sciences",
    "biology": "Biological Sciences",
    "physics": "Department of Physics & Astronomy",
    "phys": "Department of Physics & Astronomy",
    "marine": "Marine & Coastal Sciences",
    "marine sciences": "Marine & Coastal Sciences",
    "bme": "Biomedical Engineering",
    "biomedical engineering": "Biomedical Engineering",
    "chem": "Department of Chemistry",
    "chemistry": "Department of Chemistry",
    "math": "Department of Mathematics",
    "mathematics": "Department of Mathematics",
    "ee": "Electrical & Computer Engineering",
    "electrical engineering": "Electrical & Computer Engineering",
    "mech e": "Mechanical & Aerospace Engineering",
    "mechanical engineering": "Mechanical & Aerospace Engineering"
}

@dataclass
class UniversityEntities:
    pi_name: str
    co_pi_names: List[str]
    sponsor_agency: str
    grant_number: str
    award_amount: float
    cfda_code: str
    department: str
    key_topics: List[str]
    irb_protocol: str
    confidence_scores: Dict[str, float]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

def normalize_sponsor_agency(agency: Optional[str]) -> str:
    """Normalizes sponsor agency variations into official canonical title."""
    if not agency:
        return "Internal University Funds"
    clean = agency.strip().lower()
    if clean.startswith("the "):
        clean = clean[4:].strip()
    clean_stripped = clean.rstrip(".,;")
    if clean_stripped in SPONSOR_SYNONYMS:
        return SPONSOR_SYNONYMS[clean_stripped]
    clean_no_punct = re.sub(r"[^\w\s]", "", clean).strip()
    clean_no_punct = re.sub(r"\s+", " ", clean_no_punct)
    if clean_no_punct in SPONSOR_SYNONYMS:
        return SPONSOR_SYNONYMS[clean_no_punct]
    return agency.strip()

def normalize_department(dept: Optional[str], default: str = "Research Division") -> str:
    """Normalizes department variations into university standard taxonomy."""
    if not dept:
        return default
    clean = dept.strip().lower().rstrip(".,;")
    return DEPARTMENT_SYNONYMS.get(clean, dept.strip())

def normalize_award_amount(amount_raw: Any) -> float:
    """Extracts floating point dollar amount from numbers or formatted strings."""
    if isinstance(amount_raw, (int, float)):
        return float(amount_raw)
    if not amount_raw:
        return 0.0
    text = str(amount_raw).replace(",", "").replace("$", "").strip()
    match = re.search(r"([0-9]+(?:\.[0-9]+)?)", text)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return 0.0
    return 0.0

def normalize_cfda_code(cfda_raw: Optional[str]) -> str:
    """Validates and formats CFDA code (e.g. 47.041)."""
    if not cfda_raw:
        return "N/A"
    clean = cfda_raw.strip()
    match = re.search(r"(\d{2}\.\d{3})", clean)
    if match:
        return match.group(1)
    return clean if len(clean) < 20 else "N/A"

def heuristic_extract_university_entities(
    text: str,
    title: str = "",
    default_department: str = "Research Division"
) -> UniversityEntities:
    """
    Deterministic rule-based extractor used when LLM is unavailable or for baseline comparison.
    """
    confidence: Dict[str, float] = {}

    # 1. PI Extraction
    pi_name = "Unknown Faculty PI"
    pi_match = re.search(
        r"(?:Principal Investigator|P\.I\.|Lead Investigator|Faculty Lead|Project Director|PI)[: \t]+([A-Z][a-zA-Z\.\-]+(?:[ \t]+[A-Z][a-zA-Z\.\-]+){1,3})",
        text
    )
    if pi_match:
        pi_name = pi_match.group(1).strip()
        confidence["pi_name"] = 0.85
    else:
        # Check title if formatted like "Dr. Jane Doe: Project..."
        title_pi_match = re.search(r"^(?:Dr\.|Prof\.)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})", title)
        if title_pi_match:
            pi_name = title_pi_match.group(1).strip()
            confidence["pi_name"] = 0.75
        else:
            confidence["pi_name"] = 0.20

    # 2. Co-PI Extraction
    co_pi_names = []
    copi_match = re.search(
        r"(?:Co-Principal Investigator|Co-P\.I\.|Co-PIs?|Co-Investigators?)[:\s]+([^\n\r;]+)",
        text
    )
    if copi_match:
        raw_copis = copi_match.group(1).split(",")
        co_pi_names = [c.strip() for c in raw_copis if len(c.strip()) > 3][:5]
        confidence["co_pi_names"] = 0.80
    else:
        confidence["co_pi_names"] = 0.50

    # 3. Sponsor Agency Extraction
    sponsor_agency = "Internal University Funds"
    for syn, canonical in SPONSOR_SYNONYMS.items():
        if re.search(rf"\b{re.escape(syn)}\b", text, re.IGNORECASE):
            sponsor_agency = canonical
            confidence["sponsor_agency"] = 0.90
            break
    if sponsor_agency == "Internal University Funds":
        confidence["sponsor_agency"] = 0.30

    # 4. Award Amount
    amt_match = re.search(r"\$\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?)", text)
    if not amt_match:
        amt_match = re.search(r"\$\s*([0-9]+(?:\.[0-9]{2})?)", text)
    if amt_match:
        award_amount = normalize_award_amount(amt_match.group(1))
        confidence["award_amount"] = 0.90
    else:
        award_amount = 0.0
        confidence["award_amount"] = 0.30

    # 5. Grant Number
    grant_match = re.search(
        r"(?:Award Number|Grant Number|Award ID|Proposal Number|Grant No\.?|Award#)[:\s]+([A-Z0-9\-_]{5,25})",
        text,
        re.IGNORECASE
    )
    if grant_match:
        grant_number = grant_match.group(1).strip()
        confidence["grant_number"] = 0.90
    else:
        grant_number = "N/A"
        confidence["grant_number"] = 0.30

    # 6. CFDA Code
    cfda_match = re.search(r"(?:CFDA|Assistance Listing)[:\s]*(?:No\.?)?\s*(\d{2}\.\d{3})", text, re.IGNORECASE)
    if cfda_match:
        cfda_code = cfda_match.group(1).strip()
        confidence["cfda_code"] = 0.95
    else:
        # Default mapping based on sponsor
        if "National Science Foundation" in sponsor_agency:
            cfda_code = "47.041"
            confidence["cfda_code"] = 0.70
        elif "National Institutes of Health" in sponsor_agency:
            cfda_code = "93.855"
            confidence["cfda_code"] = 0.70
        else:
            cfda_code = "N/A"
            confidence["cfda_code"] = 0.20

    # 7. Department
    dept = normalize_department(default_department)
    confidence["department"] = 0.85

    # 8. Key Topics (Keywords)
    topics = []
    topic_keywords = [
        "Quantum Computing", "Genomics", "Artificial Intelligence", "Autonomous Systems",
        "Marine Ecology", "Renewable Energy", "Bioinformatics", "Neuroscience",
        "Cybersecurity", "Materials Science", "Nanotechnology", "Climate Dynamics"
    ]
    for tk in topic_keywords:
        if re.search(rf"\b{re.escape(tk)}\b", text, re.IGNORECASE):
            topics.append(tk)
    if not topics:
        topics = ["Institutional Research", "Academic Grant"]
    confidence["key_topics"] = 0.75

    # 9. IRB Protocol
    irb_match = re.search(r"(?:IRB|IACUC|Protocol)[\s#:\-]+([A-Z0-9\-]+)", text, re.IGNORECASE)
    if irb_match:
        irb_protocol = f"IRB-{irb_match.group(1).strip()}"
        confidence["irb_protocol"] = 0.85
    else:
        irb_protocol = "Not Applicable (Exempt)"
        confidence["irb_protocol"] = 0.90

    return UniversityEntities(
        pi_name=pi_name,
        co_pi_names=co_pi_names,
        sponsor_agency=sponsor_agency,
        grant_number=grant_number,
        award_amount=award_amount,
        cfda_code=cfda_code,
        department=dept,
        key_topics=topics[:6],
        irb_protocol=irb_protocol,
        confidence_scores=confidence
    )

def extract_university_entities(
    text: str,
    title: str = "",
    department_hint: str = "Research Division"
) -> UniversityEntities:
    """
    Main extraction function: Uses Groq LLM rotation with structured JSON prompt,
    falls back smoothly to heuristic extraction upon any error or missing keys.
    """
    prompt = f"""You are an expert Institutional Research Administrator and NER system at a Tier-1 Research University.
Extract structured academic entities from the document text provided below.

DOCUMENT TITLE: {title}
DEPARTMENT HINT: {department_hint}

DOCUMENT TEXT:
\"\"\"
{text[:4500]}
\"\"\"

INSTRUCTIONS:
1. Extract the following fields strictly as valid JSON:
   - "pi_name": Full name of the Principal Investigator (e.g., "Dr. Elena Vance" or "Marcus Vance").
   - "co_pi_names": Array of Co-Principal Investigator names.
   - "sponsor_agency": Sponsoring agency (e.g., NSF, NIH, DOE, DARPA, ONR, NASA).
   - "grant_number": Official award or grant identification number (or "N/A").
   - "award_amount": Total dollar amount as a number (e.g., 750000.0 or 0.0 if not specified).
   - "cfda_code": Catalog of Federal Domestic Assistance number (e.g., "47.041" or "93.855").
   - "department": Academic department (e.g., "Computer Science & Engineering", "Marine Sciences").
   - "key_topics": Array of 3 to 6 specific scientific/technical research keywords.
   - "irb_protocol": IRB/IACUC protocol number if human/animal subjects are involved, otherwise "Not Applicable (Exempt)".
   - "confidence_scores": Object containing a confidence float (0.0 to 1.0) for each field above.

Return ONLY a valid JSON object matching this structure:
{{
  "pi_name": "string",
  "co_pi_names": ["string"],
  "sponsor_agency": "string",
  "grant_number": "string",
  "award_amount": 0.0,
  "cfda_code": "string",
  "department": "string",
  "key_topics": ["string"],
  "irb_protocol": "string",
  "confidence_scores": {{
    "pi_name": 0.95,
    "sponsor_agency": 0.98,
    "award_amount": 0.90,
    "grant_number": 0.90,
    "cfda_code": 0.85,
    "department": 0.90,
    "key_topics": 0.90,
    "irb_protocol": 0.95
  }}
}}
"""
    system_prompt = "You are a Tier-1 University Research Administration NER system. Return only clean, validated JSON."

    llm_result = groq_rotator.call_json_completion(
        prompt=prompt,
        system_prompt=system_prompt,
        temperature=0.1,
        max_tokens=1200
    )

    if not llm_result or not isinstance(llm_result, dict):
        logger.info("Using heuristic entity extraction fallback.")
        return heuristic_extract_university_entities(text, title, department_hint)

    # Process and normalize LLM fields
    try:
        raw_pi = llm_result.get("pi_name") or "Unknown Faculty PI"
        raw_co_pis = llm_result.get("co_pi_names") or []
        if isinstance(raw_co_pis, str):
            raw_co_pis = [raw_co_pis]
        
        raw_sponsor = normalize_sponsor_agency(llm_result.get("sponsor_agency"))
        raw_grant_no = str(llm_result.get("grant_number") or "N/A").strip()
        raw_amount = normalize_award_amount(llm_result.get("award_amount"))
        if raw_amount <= 0.0:
            amt_match = re.search(r"\$\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?)", text)
            if not amt_match:
                amt_match = re.search(r"\$\s*([0-9]+(?:\.[0-9]{2})?)", text)
            if amt_match:
                raw_amount = normalize_award_amount(amt_match.group(1))
        raw_cfda = normalize_cfda_code(llm_result.get("cfda_code"))
        raw_dept = normalize_department(llm_result.get("department") or department_hint)
        raw_topics = llm_result.get("key_topics") or ["Institutional Research"]
        if isinstance(raw_topics, str):
            raw_topics = [raw_topics]
        raw_irb = str(llm_result.get("irb_protocol") or "Not Applicable (Exempt)").strip()

        conf_scores = llm_result.get("confidence_scores", {})
        if not isinstance(conf_scores, dict):
            conf_scores = {}

        # Fill default confidences if missing
        default_conf = {
            "pi_name": 0.90 if raw_pi != "Unknown Faculty PI" else 0.30,
            "sponsor_agency": 0.95 if raw_sponsor != "Internal University Funds" else 0.40,
            "award_amount": 0.90 if raw_amount > 0 else 0.40,
            "grant_number": 0.85 if raw_grant_no != "N/A" else 0.30,
            "cfda_code": 0.85 if raw_cfda != "N/A" else 0.30,
            "department": 0.90,
            "key_topics": 0.85,
            "irb_protocol": 0.90
        }
        for k, v in default_conf.items():
            if k not in conf_scores:
                conf_scores[k] = v
            else:
                try:
                    conf_scores[k] = float(conf_scores[k])
                except (ValueError, TypeError):
                    conf_scores[k] = v

        return UniversityEntities(
            pi_name=raw_pi,
            co_pi_names=[str(c).strip() for c in raw_co_pis if str(c).strip()],
            sponsor_agency=raw_sponsor,
            grant_number=raw_grant_no,
            award_amount=raw_amount,
            cfda_code=raw_cfda,
            department=raw_dept,
            key_topics=[str(t).strip() for t in raw_topics if str(t).strip()][:6],
            irb_protocol=raw_irb,
            confidence_scores=conf_scores
        )
    except Exception as e:
        logger.error(f"Error parsing LLM entity extraction: {e}. Falling back to heuristics.")
        return heuristic_extract_university_entities(text, title, department_hint)
