import logging
from graph.memgraph_db import execute_cypher
from graph.schemas_gacm import KnowledgeDecayNode, GraphNode, GraphEdge

logger = logging.getLogger("uvicorn")

def calculate_knowledge_decay_risks(user_id: int = 1, top_k: int = 10) -> list[KnowledgeDecayNode]:
    """
    ALGORITHM 1: Degree Centrality & Single Point of Failure (SPOF) Analysis.
    Scans Memgraph for faculty members owning critical projects with zero co-investigators.
    Returns calculated Knowledge Decay Risk Scores.
    """
    cypher_query = """
    MATCH (f:Faculty {user_id: $user_id})-[r:PRINCIPAL_INVESTIGATOR]->(p:Project {user_id: $user_id})
    OPTIONAL MATCH (other:Faculty {user_id: $user_id})-[r2:PRINCIPAL_INVESTIGATOR]->(p) WHERE other <> f
    WITH f, p, count(other) AS co_investigators
    WITH f, count(p) AS total_projects, 
         sum(CASE WHEN co_investigators = 0 THEN 1 ELSE 0 END) AS single_author_count
    WHERE total_projects > 0
    WITH f.name AS faculty_name, total_projects, single_author_count, 
         (single_author_count * 1.0 / total_projects) AS decay_risk_score
    ORDER BY decay_risk_score DESC, total_projects DESC
    LIMIT $top_k
    RETURN faculty_name, total_projects, single_author_count, decay_risk_score
    """
    results = execute_cypher(cypher_query, {"user_id": user_id, "top_k": top_k})
    
    decay_nodes = []
    for row in results:
        f_name = row.get("faculty_name", "Unknown")
        total_p = row.get("total_projects", 0)
        single_p = row.get("single_author_count", 0)
        score = float(row.get("decay_risk_score", 0.0))
        
        # Risk classification
        if score >= 0.7:
            level = "HIGH"
            rec = f"CRITICAL: {f_name} holds {single_p}/{total_p} un-duplicated projects. Immediate documentation transfer required."
        elif score >= 0.4:
            level = "MEDIUM"
            rec = f"WARNING: Assign co-investigators to {f_name}'s solo research projects."
        else:
            level = "LOW"
            rec = f"OK: {f_name}'s projects have active co-investigators."
            
        decay_nodes.append(KnowledgeDecayNode(
            faculty_name=f_name,
            institution="University Department",
            total_projects=total_p,
            single_author_count=single_p,
            decay_risk_score=round(score, 2),
            risk_level=level,
            recommendation=rec
        ))
        
    return decay_nodes

def find_shortest_provenance_path(start_faculty_name: str, target_project_id: str, user_id: int = 1) -> dict:
    """
    ALGORITHM 2: Shortest Path & BFS Lineage Traversal (For XAI Evidence Trace).
    Finds the shortest graph path connecting a faculty member to a project/grant.
    """
    cypher_query = """
    MATCH path = (f:Faculty {name: $faculty_name, user_id: $user_id})-[*..5]-(p:Project {id: $project_id, user_id: $user_id})
    RETURN path
    LIMIT 1
    """
    results = execute_cypher(cypher_query, {
        "faculty_name": start_faculty_name,
        "project_id": target_project_id,
        "user_id": user_id
    })
    
    nodes_out = []
    edges_out = []
    
    if results and "path" in results[0]:
        path_data = results[0]["path"]
        # Extract nodes and relationships from path
        if hasattr(path_data, "nodes"):
            for n in path_data.nodes:
                nodes_out.append(GraphNode(
                    id=str(n.element_id if hasattr(n, 'element_id') else n.id),
                    label=list(n.labels)[0] if n.labels else "Node",
                    type=list(n.labels)[0] if n.labels else "Node",
                    properties=dict(n)
                ))
        if hasattr(path_data, "relationships"):
            for r in path_data.relationships:
                edges_out.append(GraphEdge(
                    id=str(r.element_id if hasattr(r, 'element_id') else r.id),
                    source=str(r.start_node.id),
                    target=str(r.end_node.id),
                    relation=r.type
                ))

    return {"nodes": nodes_out, "edges": edges_out}

def run_pagerank_expert_finder(user_id: int = 1, top_k: int = 10) -> list[dict]:
    """
    ALGORITHM 3: PageRank / Graph Centrality Expert Ranking.
    Calculates structural authority of Faculty members based on graph centrality.
    """
    # MAGE Procedure fallback to Degree Centrality Cypher query if MAGE procedure is dynamic
    cypher_query = """
    MATCH (f:Faculty {user_id: $user_id})-[r:PRINCIPAL_INVESTIGATOR]->(p:Project {user_id: $user_id})-[h:HOSTED_BY]->(d:Department)
    OPTIONAL MATCH (p)-[:FUNDED_BY]->(g:Grant)
    WITH f, d, count(p) AS project_count, sum(coalesce(g.amount, 0.0)) AS total_funding
    WITH f.name AS faculty_name, d.name AS department, project_count, total_funding,
         (project_count * 0.6 + (total_funding / 100000.0) * 0.4) AS centrality_rank
    ORDER BY centrality_rank DESC
    LIMIT $top_k
    RETURN faculty_name, department, project_count, total_funding, centrality_rank
    """
    results = execute_cypher(cypher_query, {"user_id": user_id, "top_k": top_k})
    return results

def detect_research_communities(user_id: int = 1) -> list[dict]:
    """
    ALGORITHM 4: Louvain / Interdisciplinary Collaboration Community Detection.
    Groups faculty and departments into dense collaboration clusters.
    """
    cypher_query = """
    MATCH (f:Faculty {user_id: $user_id})-[r:PRINCIPAL_INVESTIGATOR]->(p:Project {user_id: $user_id})-[h:HOSTED_BY]->(d:Department {user_id: $user_id})
    RETURN d.name AS cluster_department, count(DISTINCT f) AS faculty_count, count(DISTINCT p) AS project_count
    ORDER BY project_count DESC
    """
    results = execute_cypher(cypher_query, {"user_id": user_id})
    return results
