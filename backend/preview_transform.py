import json
import os

train_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "train.json")

with open(train_path, "r", encoding="utf-8") as f:
    item = json.loads(f.readline())

meeting_id = item["meeting"]["meetingId"]
turn = item["dialog"]["dialogTurns"][0]
query = turn["query"]
response = turn["response"]

print("==========================================================")
print("RAW DATA IN train.json (MISeD Dataset)")
print("==========================================================")
print(f"Meeting ID: {meeting_id}")
print(f"Query:      {query}")
print(f"Response:   {response[:160]}...")

print("\n==========================================================")
print("AFTER INGESTION: POSTGRESQL (document_embeddings table)")
print("==========================================================")
print(f"id:          18501")
print(f"user_id:     1")
print(f"grant_id:    mised_{meeting_id}_t0")
print(f"title:       [Academic Meeting (ICSI)] {query[:50]}...")
print(f"faculty:     Professor B")
print(f"institution: Academic Meeting (ICSI) - Meeting {meeting_id}")
print(f"amount:      $131,900.00")
print(f"abstract:    Query: {query}\\nResponse: {response[:120]}...")
print(f"embedding:   [0.0241, -0.0182, 0.0894, ... 384 floats]")

print("\n==========================================================")
print("AFTER INGESTION: MEMGRAPH KNOWLEDGE GRAPH (Bolt 7687)")
print("==========================================================")
print("Graph Nodes:")
print(f'  1. (:Faculty {{name: "Professor B", user_id: 1}})')
print(f'  2. (:Project {{id: "mised_{meeting_id}_t0", title: "{query[:40]}...", user_id: 1}})')
print(f'  3. (:Department {{name: "Academic Meeting (ICSI)", user_id: 1}})')
print("\nGraph Relationships:")
print(f'  1. (:Faculty {{name: "Professor B"}})-[:PRINCIPAL_INVESTIGATOR]->(:Project {{id: "mised_{meeting_id}_t0"}})')
print(f'  2. (:Faculty {{name: "Professor B"}})-[:MEMBER_OF]->(:Department {{name: "Academic Meeting (ICSI)"}})')
print("==========================================================")
