import os
import sys
import json
import ast
import warnings
import pandas as pd

# Suppress Hugging Face Windows Symlink Warnings
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
warnings.filterwarnings("ignore")

from dotenv import load_dotenv
from datasets import load_dataset

load_dotenv()

def safe_eval(val, key, default="Unknown"):
    """Safely extracts a nested key from dict or stringified dict."""
    if not val:
        return default
    if isinstance(val, dict):
        return val.get(key, default) or default
    if isinstance(val, str):
        try:
            d = ast.literal_eval(val)
            if isinstance(d, dict):
                return d.get(key, default) or default
        except Exception:
            pass
    return default

def main():
    print("==========================================================")
    print("SMRUTI X: DATASET EXTRACTION PIPELINE (10K RECORDS)")
    print("==========================================================")
    
    hf_token = os.getenv("HF_TOKEN")
    if hf_token:
        print(f"[INFO] Using HF_TOKEN: {hf_token[:6]}...{hf_token[-4:]}")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(script_dir, exist_ok=True)
    
    output_csv = os.path.join(script_dir, "university_data_10k.csv")
    nodes_json = os.path.join(script_dir, "graph_nodes_10k.json")
    edges_json = os.path.join(script_dir, "graph_edges_10k.json")
    
    print("\n[STEP 1/4] Streaming 10,000 records from 'ccm/nsf-awards'...")
    try:
        ds_stream = load_dataset("ccm/nsf-awards", split="train", streaming=True, token=hf_token)
        raw_records = []
        for i, record in enumerate(ds_stream):
            raw_records.append(record)
            if len(raw_records) >= 10000:
                break
        print(f"[SUCCESS] Streamed {len(raw_records)} records successfully.")
    except Exception as e:
        print(f"[ERROR] Streaming failed: {e}")
        sys.exit(1)

    print("\n[STEP 2/4] Parsing and extracting schema fields...")
    cleaned_rows = []
    
    for row in raw_records:
        g_id = str(row.get("AwardID", ""))
        p_title = str(row.get("AwardTitle", "")).strip()
        if not p_title:
            continue
            
        f_name = safe_eval(row.get("Investigator"), "PI_FULL_NAME", "Unknown Faculty")
        inst_name = safe_eval(row.get("Institution"), "Name", "Unknown Institution")
        amt = row.get("AwardAmount", 0.0)
        try:
            amt = float(amt) if amt else 0.0
        except Exception:
            amt = 0.0
            
        s_date = str(row.get("AwardEffectiveDate", "N/A"))
        abstract = str(row.get("AbstractNarration", "")).strip()
        if not abstract or abstract == "None":
            abstract = f"Research project focused on {p_title} at {inst_name}."

        cleaned_rows.append({
            "grant_id": g_id,
            "project_title": p_title,
            "faculty_name": f_name,
            "institution": inst_name,
            "award_amount": amt,
            "start_date": s_date,
            "abstract": abstract
        })

    df_clean = pd.DataFrame(cleaned_rows)
    print(f"[SUCCESS] Extracted {len(df_clean)} clean records!")

    print("\n[STEP 3/4] Building Memgraph Graph Nodes & Edges...")
    nodes = []
    edges = []

    for idx, row in df_clean.iterrows():
        g_id = str(row["grant_id"])
        f_name = str(row["faculty_name"])
        inst_name = str(row["institution"])
        p_title = str(row["project_title"])
        amt = float(row["award_amount"])
        
        nodes.append({"type": "Faculty", "id": f"faculty_{idx}", "name": f_name})
        nodes.append({"type": "Project", "id": f"project_{g_id}", "title": p_title, "abstract": str(row["abstract"])[:300]})
        nodes.append({"type": "Grant", "id": f"grant_{g_id}", "amount": amt, "start_date": str(row["start_date"])})
        nodes.append({"type": "Department", "id": f"dept_{idx}", "name": inst_name})
        
        edges.append({"source": f"faculty_{idx}", "relation": "PRINCIPAL_INVESTIGATOR", "target": f"project_{g_id}"})
        edges.append({"source": f"project_{g_id}", "relation": "FUNDED_BY", "target": f"grant_{g_id}"})
        edges.append({"source": f"project_{g_id}", "relation": "HOSTED_BY", "target": f"dept_{idx}"})

    with open(nodes_json, "w", encoding="utf-8") as f:
        json.dump(nodes, f, indent=2)
    with open(edges_json, "w", encoding="utf-8") as f:
        json.dump(edges, f, indent=2)

    print(f"\n[STEP 4/4] Exporting Master CSV to: {output_csv}")
    df_clean.to_csv(output_csv, index=False, encoding="utf-8")
    print(f"[SUCCESS] Master CSV Saved ({os.path.getsize(output_csv) / (1024*1024):.2f} MB)")
    print(f"[SUCCESS] Graph Nodes JSON Saved ({len(nodes)} total nodes)")
    print(f"[SUCCESS] Graph Edges JSON Saved ({len(edges)} total edges)")

    print("\n==========================================================")
    print("FIRST 5 ROWS PREVIEW")
    print("==========================================================")
    preview = df_clean.head(5)
    for idx, row in preview.iterrows():
        print(f"\n--- ROW {idx + 1} ---")
        print(f"Grant ID     : {row['grant_id']}")
        print(f"Faculty Name : {row['faculty_name']}")
        print(f"Institution  : {row['institution']}")
        print(f"Award Amount : ${row['award_amount']:,.2f}")
        print(f"Start Date   : {row['start_date']}")
        print(f"Project Title: {row['project_title']}")
        print(f"Abstract     : {str(row['abstract'])[:150]}...")

    print("\n==========================================================")
    print("DATASET PREPARATION COMPLETE!")
    print(f"Total Clean Records: {len(df_clean)}")
    print("==========================================================")

if __name__ == "__main__":
    main()
