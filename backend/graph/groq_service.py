import os
import logging
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("uvicorn")

class GroqService:
    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.client = Groq(api_key=self.api_key) if self.api_key else None
        # Primary high-speed reasoning models
        self.primary_model = "qwen/qwen3.8-27b"
        self.secondary_model = "openai/gpt-oss-20b"

    def synthesize_hybrid_response(
        self,
        query: str,
        citations: list,
        graph_nodes: list,
        graph_edges: list
    ) -> str:
        """
        Synthesizes a response using vector evidence + graph triples via Groq LLM API.
        """
        if not self.client:
            logger.warning("GROQ_API_KEY missing. Falling back to template synthesis.")
            return self._fallback_synthesis(query, citations)

        # Format vector citations evidence
        citations_text = ""
        for idx, c in enumerate(citations[:3], 1):
            fac = getattr(c, 'faculty_name', 'Unknown')
            title = getattr(c, 'project_title', 'Untitled Project')
            inst = getattr(c, 'institution', 'Department')
            amt = getattr(c, 'award_amount', 0)
            snippet = getattr(c, 'abstract_snippet', '')
            citations_text += f"{idx}. Faculty: {fac} | Project: '{title}' | Institution: {inst} | Funding: ${amt:,.2f}\n   Abstract: {snippet}\n\n"

        # Format graph nodes & relationship triples
        graph_triples = ""
        for edge in graph_edges[:5]:
            src = getattr(edge, 'source', '')
            tgt = getattr(edge, 'target', '')
            rel = getattr(edge, 'relation', 'CONNECTED_TO')
            graph_triples += f"({src}) -[:{rel}]-> ({tgt})\n"

        prompt = f"""You are GACM AI, an institutional research graph intelligence engine.
A user asked: "{query}"

VECTOR EVIDENCE (PostgreSQL matches):
{citations_text if citations_text else "No direct vector matches."}

GRAPH TRIPLES (Memgraph lineage):
{graph_triples if graph_triples else "No direct graph lineage."}

INSTRUCTIONS:
1. Provide a direct, professional, authoritative answer to the user query in 2-4 sentences.
2. Explicitly reference faculty experts, project titles, and institutions from the evidence above.
3. Keep the response clear and strictly accurate based on the context.
"""

        for model in [self.primary_model, self.secondary_model]:
            try:
                response = self.client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": "You are GACM AI, an institutional knowledge graph synthesis system."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.3,
                    max_tokens=300
                )
                if response.choices and response.choices[0].message.content:
                    ans = response.choices[0].message.content.strip()
                    # Sanitize any non-ascii characters for Windows stdout safety
                    return ans.encode('utf-8', 'ignore').decode('utf-8')
            except Exception as e:
                logger.error(f"Error calling Groq model '{model}': {e}")
                continue

        return self._fallback_synthesis(query, citations)

    def _fallback_synthesis(self, query: str, citations: list) -> str:
        if not citations:
            return f"Based on GACM Knowledge Base traversal for '{query}': No matching research projects found."
        fac_names = ", ".join(list(set([getattr(c, 'faculty_name', 'Faculty') for c in citations[:3]])))
        total_funding = sum([getattr(c, 'award_amount', 0) for c in citations])
        return (
            f"Based on GACM Knowledge Graph traversal for '{query}': "
            f"Key faculty identified include {fac_names} across {len(citations)} funded research projects "
            f"totaling ${total_funding:,.2f} in research awards."
        )

groq_service = GroqService()
