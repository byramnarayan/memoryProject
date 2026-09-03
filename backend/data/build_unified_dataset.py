import json
import csv
import os
import re
from datetime import datetime, timezone

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(DATA_DIR, "unified_gacm_dataset.json")

def sanitize_text(text: str) -> str:
    """Cleans Unicode smart quotes, zero-width spaces, and control characters."""
    if not text:
        return ""
    text = str(text)
    text = text.replace('\u200b', '').replace('\u201c', '"').replace('\u201d', '"').replace('\u2018', "'").replace('\u2019', "'")
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def parse_currency(amount_str) -> float:
    """Parses dirty string currency into validated float."""
    if amount_str is None:
        return 0.0
    val_str = str(amount_str).replace('$', '').replace(',', '').strip()
    try:
        return float(val_str)
    except (ValueError, TypeError):
        return 0.0

def parse_iso_date(date_str) -> str:
    """Parses various date formats into standardized ISO-8601 string."""
    if not date_str:
        return datetime.now(timezone.utc).isoformat()
    date_str = str(date_str).strip()
    # Check MM/DD/YYYY
    if '/' in date_str:
        parts = date_str.split('/')
        if len(parts) == 3:
            try:
                m, d, y = int(parts[0]), int(parts[1]), int(parts[2])
                return datetime(y, m, d, tzinfo=timezone.utc).isoformat()
            except ValueError:
                pass
    try:
        # Check ISO parse
        dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return dt.isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()

def make_institution_id(inst_name: str) -> str:
    """Generates clean institutional entity identifier."""
    if not inst_name:
        inst_name = "Unknown Institution"
    clean = re.sub(r'[^a-zA-Z0-9]+', '_', inst_name.strip()).strip('_')
    return f"inst_{clean}"

def build_unified_dataset():
    print("==========================================================")
    print("STARTING UNIFIED MASTER DATASET CONSOLIDATION")
    print("==========================================================")

    # 1. Load Graph Nodes & Edges
    nodes_file = os.path.join(DATA_DIR, "graph_nodes_10k.json")
    edges_file = os.path.join(DATA_DIR, "graph_edges_10k.json")
    
    nodes_map = {}
    if os.path.exists(nodes_file):
        with open(nodes_file, 'r', encoding='utf-8') as f:
            nodes_list = json.load(f)
            for n in nodes_list:
                nodes_map[n['id']] = n
        print(f"Loaded {len(nodes_map)} graph nodes from graph_nodes_10k.json")
    
    edges_list = []
    if os.path.exists(edges_file):
        with open(edges_file, 'r', encoding='utf-8') as f:
            edges_list = json.load(f)
        print(f"Loaded {len(edges_list)} graph edges from graph_edges_10k.json")

    # Index graph edges by target project / grant ID
    project_triples_map = {}
    for e in edges_list:
        target_id = e['target']
        if target_id not in project_triples_map:
            project_triples_map[target_id] = []
        project_triples_map[target_id].append({
            "source": e['source'],
            "relation": e['relation'],
            "target": e['target']
        })

    records = []

    # 2. Process university_data_10k.csv (NSF Grants)
    csv_file = os.path.join(DATA_DIR, "university_data_10k.csv")
    if os.path.exists(csv_file):
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            count = 0
            for row in reader:
                count += 1
                grant_id = row.get('grant_id', '').strip()
                title = sanitize_text(row.get('project_title', ''))
                faculty_name = sanitize_text(row.get('faculty_name', 'Unknown Faculty'))
                institution = sanitize_text(row.get('institution', 'Unknown Institution'))
                award_amount = parse_currency(row.get('award_amount'))
                start_date = parse_iso_date(row.get('start_date'))
                abstract = sanitize_text(row.get('abstract', ''))

                rec_id = f"grant_{grant_id}"
                inst_id = make_institution_id(institution)
                faculty_id = f"faculty_{re.sub(r'[^a-zA-Z0-9]+', '_', faculty_name).strip('_')}"

                # Associated graph triples
                p_node_id = f"project_{grant_id}"
                associated_triples = project_triples_map.get(p_node_id, [
                    {"source": faculty_id, "relation": "PRINCIPAL_INVESTIGATOR", "target": p_node_id},
                    {"source": p_node_id, "relation": "HOSTED_BY", "target": inst_id}
                ])

                records.append({
                    "record_id": rec_id,
                    "external_id": grant_id,
                    "source_system": "NSF_Grants",
                    "connector_type": "nsf_grant_api",
                    "record_type": "grant_award",
                    "institution_id": inst_id,
                    "title": title,
                    "content": abstract,
                    "author": {
                        "id": faculty_id,
                        "name": faculty_name,
                        "role": "Principal Investigator"
                    },
                    "organization": {
                        "id": inst_id,
                        "name": institution
                    },
                    "metadata": {
                        "grant_id": grant_id,
                        "award_amount": award_amount,
                        "start_date": start_date
                    },
                    "graph_triples": associated_triples,
                    "tags": ["nsf_grant", "research_portfolio", inst_id],
                    "raw_data": dict(row)
                })
        print(f"Processed {count} NSF Grant records from university_data_10k.csv")

    # 3. Process segmented_manifest.json (Institutional Governance Manifests)
    manifest_file = os.path.join(DATA_DIR, "segmented_manifest.json")
    if os.path.exists(manifest_file):
        count = 0
        with open(manifest_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    count += 1
                    institution = sanitize_text(obj.get('institution', 'University of Tennessee at Chattanooga'))
                    governing_body = sanitize_text(obj.get('governing_body', 'Governance Panel'))
                    seg_title = sanitize_text(obj.get('segment_title', 'Segment'))
                    seg_text = sanitize_text(obj.get('segment_text', ''))
                    meeting_date = parse_iso_date(obj.get('meeting_date'))
                    source_url = obj.get('source_url', '')

                    inst_id = make_institution_id(institution)
                    gov_id = f"gov_{re.sub(r'[^a-zA-Z0-9]+', '_', governing_body).strip('_')}"
                    rec_id = f"manifest_seg_{count}"

                    triples = [
                        {"source": gov_id, "relation": "GOVERNS", "target": inst_id},
                        {"source": rec_id, "relation": "ISSUED_BY", "target": inst_id}
                    ]

                    records.append({
                        "record_id": rec_id,
                        "external_id": source_url,
                        "source_system": "Institutional_Manifests",
                        "connector_type": "governance_document_importer",
                        "record_type": "governance_document_segment",
                        "institution_id": inst_id,
                        "title": f"{institution} - {governing_body}: {seg_title}",
                        "content": seg_text,
                        "author": {
                            "id": gov_id,
                            "name": governing_body,
                            "role": "Governing Body"
                        },
                        "organization": {
                            "id": inst_id,
                            "name": institution
                        },
                        "metadata": {
                            "governing_body": governing_body,
                            "meeting_date": meeting_date,
                            "date_confidence": obj.get('date_confidence', 'full'),
                            "source_url": source_url,
                            "document_type": obj.get('document_type', 'governance_doc'),
                            "segment_index": obj.get('segment_index', 0)
                        },
                        "graph_triples": triples,
                        "tags": ["governance", "institutional_manifest", inst_id],
                        "raw_data": obj
                    })
                except Exception as err:
                    print(f"Error parsing manifest line {count}: {err}")
        print(f"Processed {count} Institutional Manifest segments from segmented_manifest.json")

    # 4. Process train.json (MISeD Meeting Dialog Corpus)
    train_file = os.path.join(DATA_DIR, "train.json")
    if os.path.exists(train_file):
        count = 0
        turn_count = 0
        with open(train_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    count += 1
                    dialog_id = obj.get('dialogId', f"dialog_{count}")
                    meeting_info = obj.get('meeting', {})
                    meeting_id = meeting_info.get('meetingId', f"meeting_{count}")
                    dialog_obj = obj.get('dialog', {})
                    dialog_turns = dialog_obj.get('dialogTurns', []) if isinstance(dialog_obj, dict) else []

                    # Assign academic consortium institution
                    institution = "ICSI / AMI Meeting Consortium"
                    inst_id = make_institution_id(institution)

                    for idx, turn in enumerate(dialog_turns):
                        turn_count += 1
                        query_text = sanitize_text(turn.get('query', ''))
                        answer_text = sanitize_text(turn.get('response', ''))
                        turn_id = f"mised_{meeting_id}_t{idx}"

                        speaker_name = "Meeting Panel"
                        if meeting_info.get('transcriptSegments') and len(meeting_info['transcriptSegments']) > 0:
                            speaker_name = sanitize_text(meeting_info['transcriptSegments'][0].get('speakerName', 'Meeting Panel'))

                        speaker_id = f"speaker_{re.sub(r'[^a-zA-Z0-9]+', '_', speaker_name).strip('_')}"

                        triples = [
                            {"source": speaker_id, "relation": "SPEAKER_AT", "target": f"meeting_{meeting_id}"},
                            {"source": f"meeting_{meeting_id}", "relation": "HOSTED_BY", "target": inst_id}
                        ]

                        records.append({
                            "record_id": turn_id,
                            "external_id": dialog_id,
                            "source_system": "MISeD_Meetings",
                            "connector_type": "meeting_transcript_importer",
                            "record_type": "meeting_transcript_turn",
                            "institution_id": inst_id,
                            "title": f"[Academic Meeting ({meeting_id})] {query_text}",
                            "content": f"Query: {query_text}\nResponse: {answer_text}",
                            "author": {
                                "id": speaker_id,
                                "name": speaker_name,
                                "role": "Speaker / Faculty Panelist"
                            },
                            "organization": {
                                "id": inst_id,
                                "name": institution
                            },
                            "metadata": {
                                "meeting_id": meeting_id,
                                "dialog_id": dialog_id,
                                "turn_index": idx,
                                "query_type": turn.get('queryMetadata', {}).get('queryType', 'GENERAL')
                            },
                            "graph_triples": triples,
                            "tags": ["meeting_dialog", "academic_corpus", inst_id],
                            "raw_data": turn
                        })
                except Exception as err:
                    print(f"Error parsing train.json line {count}: {err}")
        print(f"Processed {count} meeting dialog sessions ({turn_count} QA turns) from train.json")

    # 5. Build Master JSON Output Structure
    master_output = {
        "version": "1.0.0",
        "description": "Unified Enterprise Master Dataset for GACM GraphRAG Engine",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "total_records": len(records),
        "source_systems": ["NSF_Grants", "Institutional_Manifests", "MISeD_Meetings"],
        "records": records
    }

    # Save to file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(master_output, f, indent=2)

    file_size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print("==========================================================")
    print(f"SUCCESSFULLY CREATED UNIFIED MASTER DATASET!")
    print(f"Output File: {OUTPUT_FILE}")
    print(f"Total Master Records: {len(records):,}")
    print(f"File Size: {file_size_mb:.2f} MB")
    print("==========================================================")

if __name__ == "__main__":
    build_unified_dataset()
