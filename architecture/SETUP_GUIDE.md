# GACM Project Setup & Execution Guide
## Complete Step-by-Step Installation & Cloud Migration Manual

Follow this guide to set up environment variables, run cloud data migrations, start the FastAPI backend server, and launch the Next.js frontend application.

---

## 📋 System Prerequisites

Ensure the following tools are installed on your machine:

1. **Python**: Python 3.12+ ([python.org](https://www.python.org/downloads/))
2. **`uv` Package Manager**: Fast Python package installer ([astral.sh/uv](https://astral.sh/uv))
   ```bash
   pip install uv
   ```
3. **Node.js**: Node.js v18.0+ and `npm` ([nodejs.org](https://nodejs.org/))

---

## 🌐 Step 1: Configure Cloud Environment Variables (`backend/.env`)

Create a `.env` file in the `backend/` directory:

```env
# Neon Cloud PostgreSQL
DATABASE_URL=postgresql+psycopg://neondb_owner:your_neon_password_here@ep-aged-poetry-azcrc8u8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# Neo4j Aura Cloud
NEO4J_URI=neo4j+s://9411bb5a.databases.neo4j.io
NEO4J_USERNAME=9411bb5a
NEO4J_PASSWORD=your_neo4j_aura_password_here

# Qdrant Cloud Vector DB
QDRANT_URL=https://c7595ec1-f7ae-4509-bc60-0f34b50a2e16.ca-central-1-0.aws.cloud.qdrant.io
QDRANT_API_KEY=your_qdrant_api_key_here

# Groq Cloud LLM API Keys
GROQ_API_KEY_1=your_groq_api_key_1_here
GROQ_API_KEY_2=your_groq_api_key_2_here
GROQ_API_KEY_3=your_groq_api_key_3_here
GROQ_MODEL=openai/gpt-oss-120b

# Google ADK API Key
GOOGLE_API_KEY=your_google_api_key_here

# Security & JWT Token Authentication
SECRET_KEY=941fa904a622a59a97bc876e5d8bcf517d690a618e775a9ee9c1e7a6ed7bc7a1
ALGORITHM=HS256
```

---

## 🚀 Step 2: Run Cloud Data Migration

To push all 17,973 records (NSF Grants + MISeD Meetings) to Neon PostgreSQL, Neo4j Aura Cloud, and Qdrant Cloud:

```powershell
cd backend
uv run python data/migrate_to_cloud.py
```

*(To run Qdrant vector migration only: `uv run python data/migrate_to_cloud.py --qdrant-only`)*

---

## 💻 Step 3: Start Backend & Frontend Applications

### 1. Start FastAPI Backend:
```powershell
cd backend
uv sync
uv run uvicorn main:app --reload --port 8000
```

### 2. Start Next.js Frontend:
```powershell
cd frontend
npm install
npm run dev
```

Open **`http://localhost:3000/gacm`** to test your live Google ADK Hybrid Knowledge Base!
