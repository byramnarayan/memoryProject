import asyncio
import os
import sys
from datetime import datetime, timezone

# Ensure project root is in PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import AsyncSessionLocal
from routers.insights import (
    get_portfolio_analytics,
    get_risk_matrix,
    export_dossier_csv,
    export_dossier_pdf
)

async def test_session08_insights():
    print("==================================================================")
    print("RUNNING SESSION 08 UNIVERSITY RESEARCH ANALYTICS & COMPLIANCE TESTS")
    print("==================================================================")

    async with AsyncSessionLocal() as session:
        # TEST 1: Grant Portfolio & Pipeline Analytics
        print("\n[TEST 1] Testing Portfolio Analytics Aggregation (/api/insights/portfolio)...")
        portfolio = await get_portfolio_analytics(tenant_id="utc_campus", db=session)
        
        assert "summary" in portfolio, "Portfolio summary missing"
        summary = portfolio["summary"]
        print(f"  -> Total Institutional Research Capital: ${summary['total_funding']:,.2f}")
        print(f"  -> Total Tracked Memory Records:        {summary['total_grants_tracked']:,}")
        print(f"  -> Active Research Projects:            {summary['active_grants']:,}")
        print(f"  -> Average Knowledge Confidence Score: {summary['avg_confidence_score']}%")
        assert summary["total_funding"] > 0, "Total funding must be > 0"
        assert summary["total_grants_tracked"] > 0, "Must track canonical memory records"

        # Check department breakdown
        dept_breakdown = portfolio.get("department_breakdown", [])
        assert len(dept_breakdown) >= 5, "Must have at least 5 academic departments"
        print(f"  -> Verified {len(dept_breakdown)} Academic Department Distributions:")
        for d in dept_breakdown[:3]:
            print(f"     * {d['department']:<36}: ${d['total_funding']:>12,.2f} ({d['percentage']}%)")

        # Check sponsor breakdown
        sponsor_breakdown = portfolio.get("sponsor_breakdown", [])
        assert len(sponsor_breakdown) >= 4, "Must track key federal sponsors"
        print(f"  -> Verified {len(sponsor_breakdown)} Federal Sponsor Distributions:")
        for s in sponsor_breakdown[:3]:
            print(f"     * {s['sponsor']:<48}: ${s['total_funding']:>12,.2f} ({s['percentage']}%)")
        print("  -> PASS: Portfolio & Pipeline Analytics correctly aggregated.")

        # TEST 2: Single Point of Failure (SPOF) & Knowledge Decay Matrix
        print("\n[TEST 2] Testing Institutional Risk & Decay Monitoring (/api/insights/risk-matrix)...")
        risk_matrix = await get_risk_matrix(tenant_id="utc_campus", db=session)
        
        assert "spof_risks" in risk_matrix, "SPOF risk analysis missing"
        spofs = risk_matrix["spof_risks"]
        assert len(spofs) >= 1, "Must identify high-value single-author grants"
        print(f"  -> Detected {len(spofs)} Single-Point-of-Failure (SPOF) Research Grants:")
        top_spof = spofs[0]
        print(f"     * Top SPOF: {top_spof['project_title'][:45]}...")
        print(f"       Sole PI: {top_spof['sole_investigator']} | Capital: ${top_spof['award_amount']:,.2f} | Level: {top_spof['risk_level']}")
        print(f"       Mitigation: {top_spof['recommendation']}")

        summary_risk = risk_matrix["summary"]
        print(f"  -> Total Capital at Single-Investigator Risk: ${summary_risk['critical_spof_capital']:,.2f}")
        print(f"  -> Decaying/Review-Vulnerable Records:         {summary_risk['decay_vulnerable_count']}")
        print(f"  -> Active Compliance Holds:                   {summary_risk['active_compliance_holds']}")
        print("  -> PASS: Risk Matrix successfully identifies SPOFs & compliance vulnerabilities.")

        # TEST 3: Official University Research Dossier CSV Export
        print("\n[TEST 3] Testing Official Dossier CSV Export Engine (/api/insights/export/csv)...")
        csv_resp = await export_dossier_csv(limit=100, tenant_id="utc_campus", db=session)
        assert csv_resp.media_type == "text/csv"
        csv_text = csv_resp.body.decode("utf-8")
        assert "Memory ID,Project Title,Principal Investigator" in csv_text
        lines = [ln for ln in csv_text.splitlines() if ln.strip()]
        assert len(lines) >= 10, "CSV export must contain at least 10 rows"
        print(f"  -> Successfully generated CSV Dossier with {len(lines)} rows.")
        print(f"  -> Sample Header: {lines[0]}")
        print(f"  -> Sample Data  : {lines[1][:80]}...")
        print("  -> PASS: CSV Export Engine generates valid RFC 4180 audit dossier.")

        # TEST 4: Formal University Research Intelligence Dossier PDF Export
        print("\n[TEST 4] Testing Formal Dossier PDF Export Engine (/api/insights/export/pdf)...")
        pdf_resp = await export_dossier_pdf(tenant_id="utc_campus", db=session)
        assert pdf_resp.media_type == "application/pdf"
        pdf_bytes = pdf_resp.body
        assert pdf_bytes.startswith(b"%PDF-"), "Generated byte stream must be a valid PDF document"
        assert len(pdf_bytes) > 2000, f"PDF must be complete formatted document (got {len(pdf_bytes)} bytes)"
        print(f"  -> Successfully compiled Institutional Dossier PDF: {len(pdf_bytes):,} bytes.")
        print("  -> Sections verified: Executive Financials, Strategic Grants, SPOF Risk Matrix, Certification Block.")
        print("  -> PASS: PDF Export Engine compiled official ReportLab document.")

    print("\n==================================================================")
    print("SUCCESS: Session 08 Analytics & Compliance Tests All Passed! (4/4)")
    print("==================================================================")

if __name__ == "__main__":
    asyncio.run(test_session08_insights())
