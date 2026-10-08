import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import re
from services.ner_extractor import (
    normalize_sponsor_agency,
    normalize_department,
    normalize_award_amount,
    normalize_cfda_code,
    extract_university_entities,
    heuristic_extract_university_entities,
    UniversityEntities
)
from services.processing_service import (
    generate_multi_level_summaries,
    heuristic_generate_summaries,
    calculate_quality_and_governance,
    enrich_research_memory
)

SAMPLE_NSF_GRANT_TEXT = """
NATIONAL SCIENCE FOUNDATION
DIVISION OF COMPUTER AND NETWORK SYSTEMS
ARLINGTON, VA 22230

AWARD NOTICE
Award Number: NSF-CNS-2041234
Proposal Number: 2041234
Assistance Listing / CFDA No: 47.041 - Engineering Grants

Principal Investigator: Dr. Elena Vance
Co-Principal Investigators: Dr. Marcus Vance, Dr. Kenneth Adams
Department: Computer Science & Engineering
Institution: University Technology Campus

Project Title: Resilient Consensus Protocols for Autonomous Edge Swarms
Effective Date: October 1, 2024 to September 30, 2027
Total Award Amount: $750,000.00

PROJECT ABSTRACT:
This project investigates fault-tolerant consensus mechanisms in highly distributed, intermittent edge networks. 
Autonomous swarms deployed in marine and aerial environments face severe packet loss, node attrition, and Byzantine faults.
The Principal Investigator will lead the development of asynchronous verifiable secret sharing algorithms and hardware-in-the-loop 
validation. Expected deliverables include peer-reviewed publications, open-source C++ protocol implementations, and an annual educational workshop.

COMPLIANCE & ETHICAL REVIEWS:
Human subjects involvement: None. Animal subjects: None.
Protocol status: Not Applicable (Exempt).
Export Control: EAR99.
Annual project reports must be submitted 90 days prior to the end of each current budget period via Research.gov.
"""

SAMPLE_INCOMPLETE_TEXT = """
Meeting notes from yesterday.
Discussed various lab issues and equipment repair.
No decisions made yet.
"""

def test_normalize_sponsor_agency():
    """Verify that sponsor agency synonyms resolve into canonical titles."""
    assert normalize_sponsor_agency("Nat. Sci. Found.") == "National Science Foundation (NSF)"
    assert normalize_sponsor_agency("nsf") == "National Science Foundation (NSF)"
    assert normalize_sponsor_agency("National Science Foundation") == "National Science Foundation (NSF)"
    assert normalize_sponsor_agency("NIH") == "National Institutes of Health (NIH)"
    assert normalize_sponsor_agency("Dept of Energy") == "Department of Energy (DOE)"
    assert normalize_sponsor_agency("DARPA") == "Defense Advanced Research Projects Agency (DARPA)"
    assert normalize_sponsor_agency("NASA") == "National Aeronautics and Space Administration (NASA)"
    assert normalize_sponsor_agency(None) == "Internal University Funds"

def test_normalize_department_and_cfda():
    """Verify department taxonomy normalization and CFDA extraction."""
    assert normalize_department("cs") == "Computer Science & Engineering"
    assert normalize_department("bio") == "Biological Sciences"
    assert normalize_department("physics") == "Department of Physics & Astronomy"
    assert normalize_department("marine") == "Marine & Coastal Sciences"
    assert normalize_department(None, "Biology") == "Biology"

    assert normalize_cfda_code("47.041") == "47.041"
    assert normalize_cfda_code("CFDA 93.855") == "93.855"
    assert normalize_cfda_code(None) == "N/A"

    assert normalize_award_amount("$750,000.00") == 750000.0
    assert normalize_award_amount(1250000) == 1250000.0
    assert normalize_award_amount("N/A") == 0.0

def test_extract_university_entities():
    """Verify extraction of university entities from a realistic grant award notice."""
    entities = extract_university_entities(
        text=SAMPLE_NSF_GRANT_TEXT,
        title="Resilient Consensus Protocols for Autonomous Edge Swarms",
        department_hint="Computer Science & Engineering"
    )

    assert "Elena Vance" in entities.pi_name
    assert "Marcus Vance" in " ".join(entities.co_pi_names)
    assert entities.sponsor_agency == "National Science Foundation (NSF)"
    assert "2041234" in entities.grant_number
    assert entities.award_amount == 750000.0
    assert entities.cfda_code == "47.041"
    assert "Computer Science" in entities.department
    assert len(entities.key_topics) >= 1
    assert isinstance(entities.confidence_scores, dict)
    assert entities.confidence_scores.get("pi_name", 0) > 0.70

def test_multi_level_summarization():
    """Verify generation of all three summary tiers."""
    entities = heuristic_extract_university_entities(
        text=SAMPLE_NSF_GRANT_TEXT,
        title="Resilient Consensus Protocols for Autonomous Edge Swarms",
        default_department="Computer Science & Engineering"
    )

    summaries = generate_multi_level_summaries(
        text=SAMPLE_NSF_GRANT_TEXT,
        title="Resilient Consensus Protocols for Autonomous Edge Swarms",
        entities=entities,
        memory_type="GrantAward"
    )

    # 1. Short summary check
    assert "short_summary" in summaries
    assert len(summaries["short_summary"]) > 20
    assert len(summaries["short_summary"]) < 500

    # 2. Detailed summary check
    assert "detailed_summary" in summaries
    assert len(summaries["detailed_summary"]) > 100

    # 3. Compliance summary check
    assert "compliance_summary" in summaries
    comp = summaries["compliance_summary"]
    assert isinstance(comp, dict)
    assert "reporting_requirements" in comp or "deliverable_milestones" in comp

def test_quality_and_governance_complete_doc():
    """Verify high-quality documents pass governance with approved status."""
    entities = UniversityEntities(
        pi_name="Dr. Elena Vance",
        co_pi_names=["Dr. Marcus Vance"],
        sponsor_agency="National Science Foundation (NSF)",
        grant_number="NSF-CNS-2041234",
        award_amount=750000.0,
        cfda_code="47.041",
        department="Computer Science & Engineering",
        key_topics=["Consensus Protocols", "Edge Computing"],
        irb_protocol="Exempt",
        confidence_scores={"pi_name": 0.95, "sponsor_agency": 0.98}
    )
    summaries = {
        "short_summary": "Resilient consensus grant led by Dr. Elena Vance.",
        "detailed_summary": "Detailed research on fault-tolerant swarms.",
        "compliance_summary": {"reporting": "Annual report due in 90 days"}
    }

    score, needs_review, review_status, review_reasons = calculate_quality_and_governance(
        text=SAMPLE_NSF_GRANT_TEXT,
        title="Resilient Consensus Protocols for Autonomous Edge Swarms",
        entities=entities,
        summaries=summaries
    )

    assert score >= 70.0
    assert needs_review is False
    assert review_status == "approved"
    assert len(review_reasons) == 0

def test_quality_and_governance_incomplete_doc():
    """Verify incomplete or ambiguous documents are flagged for human review (needs_review=True)."""
    entities = UniversityEntities(
        pi_name="Unknown Faculty PI",
        co_pi_names=[],
        sponsor_agency="Internal University Funds",
        grant_number="N/A",
        award_amount=0.0,
        cfda_code="N/A",
        department="Research Division",
        key_topics=[],
        irb_protocol="N/A",
        confidence_scores={"pi_name": 0.20}
    )
    summaries = {
        "short_summary": "Notes from meeting.",
        "detailed_summary": "Incomplete notes.",
        "compliance_summary": {}
    }

    score, needs_review, review_status, review_reasons = calculate_quality_and_governance(
        text=SAMPLE_INCOMPLETE_TEXT,
        title="Untitled Notes",
        entities=entities,
        summaries=summaries
    )

    assert score < 70.0
    assert needs_review is True
    assert review_status == "pending_review"
    assert len(review_reasons) > 0
    assert any("Principal Investigator" in r for r in review_reasons)

def test_enrich_research_memory_full_pipeline():
    """Verify the entire end-to-end enrichment pipeline."""
    result = enrich_research_memory(
        text=SAMPLE_NSF_GRANT_TEXT,
        title="Resilient Consensus Protocols for Autonomous Edge Swarms",
        memory_type="GrantAward",
        department_hint="Computer Science & Engineering",
        sensitivity_level="Public"
    )

    assert "entities" in result
    assert "summaries" in result
    assert "overall_score" in result
    assert "needs_review" in result
    assert "review_status" in result
    assert "tags" in result

    assert result["entities"]["pi_name"] != "Unknown Faculty PI"
    assert result["overall_score"] >= 70.0
    assert result["needs_review"] is False
    assert "grantaward" in result["tags"]

def test_heuristic_fallback_resilience():
    """Verify fallback extractor runs without throwing and produces compliant structure."""
    entities = heuristic_extract_university_entities(
        text=SAMPLE_NSF_GRANT_TEXT,
        title="Edge Swarms",
        default_department="Computer Science"
    )
    assert entities.pi_name == "Dr. Elena Vance"
    assert entities.award_amount == 750000.0

    summaries = heuristic_generate_summaries(
        text=SAMPLE_NSF_GRANT_TEXT,
        title="Edge Swarms",
        entities=entities,
        memory_type="GrantAward"
    )
    assert "short_summary" in summaries
    assert "detailed_summary" in summaries
    assert "compliance_summary" in summaries

def run_all_tests():
    print("==================================================================")
    print("RUNNING SESSION 04 AI PROCESSING ENGINE INTEGRATION TESTS")
    print("==================================================================")

    tests = [
        ("1. Sponsor Agency Normalization", test_normalize_sponsor_agency),
        ("2. Department & CFDA Normalization", test_normalize_department_and_cfda),
        ("3. University NER Extraction", test_extract_university_entities),
        ("4. Multi-Level Summaries Generation", test_multi_level_summarization),
        ("5. Quality Scoring (Complete Document)", test_quality_and_governance_complete_doc),
        ("6. Quality Scoring & Flagging (Incomplete Document)", test_quality_and_governance_incomplete_doc),
        ("7. End-to-End Enrichment Pipeline", test_enrich_research_memory_full_pipeline),
        ("8. Heuristic Fallback Resilience", test_heuristic_fallback_resilience)
    ]

    for name, func in tests:
        print(f"\n[RUNNING] {name}...")
        func()
        print(f"  -> PASS: {name}")

    print("\n==================================================================")
    print("SUCCESS: Session 04 AI Processing Engine Tests All Passed! (8/8)")
    print("==================================================================")

if __name__ == "__main__":
    run_all_tests()

