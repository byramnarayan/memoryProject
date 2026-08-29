# GACM Project Setup & Execution Guide
## Complete Step-by-Step Installation & Local Run Manual

Follow this guide to set up the database dependencies, ingest dataset embeddings, run the FastAPI backend server, and launch the Next.js frontend application on any computer.

---

## 📋 System Prerequisites

Ensure the following tools are installed on your machine:

1. **Python**: Python 3.12+ installed ([python.org](https://www.python.org/downloads/))
2. **`uv` Package Manager**: Fast Python package installer ([astral.sh/uv](https://astral.sh/uv))
   ```bash
   pip install uv
   ```
3. **Node.js**: Node.js v18.0+ and `npm` ([nodejs.org](https://nodejs.org/))
4. **PostgreSQL**: PostgreSQL 14+ installed and running locally ([postgresql.org](https://www.postgresql.org/))
5. **Memgraph Graph DB**: Memgraph running locally via Docker or native service ([memgraph.com](https://memgraph.com/docs/getting-started))
   ```bash
   docker run -p 7687:7687 -p 7444:7444 -p 3000:3000 memgraph/memgraph-platform
   ```

---

## 🗄️ Step 1: Set Up PostgreSQL & Environment Variables

1. **Create PostgreSQL Database**:
   Open PostgreSQL `psql` or pgAdmin and create a database named `community` and user `ramnarayan`:
   ```sql
   CREATE DATABASE community;
   CREATE USER ramnarayan WITH PASSWORD '123456';
   GRANT ALL PRIVILEGES ON DATABASE community TO ramnarayan;
   ```

2. **Configure Backend Environment Variables (`backend/.env`)**:
   Create a `.env` file in the `backend/` directory:
   ```env
   DATABASE_URL=postgresql+psycopg://ramnarayan:123456@localhost/community
   MEMGRAPH_HOST=127.0.0.1
   MEMGRAPH_PORT=7687
   GROQ_API_KEY=your_groq_api_key_here
   SECRET_KEY=your_super_secret_jwt_key_here
   ```

---

## 📦 Step 2: Install Python Dependencies & Database Tables

1. Open terminal in the `backend/` folder:
   ```bash
   cd backend
   ```

2. **Install Python virtual environment & packages using `uv`**:
   ```bash
   uv sync
   ```

3. **Initialize Database Tables**:
   Run the table creation script to set up `users`, `document_embeddings`, `gacm_chat_sessions`, and `topic_discussion_comments`:
   ```bash
   uv run python -c "
   import asyncio, sys
   if sys.platform == 'win32':
       asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
   from database import engine, Base
   import models, graph.models_gacm
   async def init_db():
       async with engine.begin() as conn:
           await conn.run_sync(Base.metadata.create_all)
       print('PostgreSQL Tables Created Successfully!')
   asyncio.run(init_db())
   "
   ```

---

## 🧠 Step 3: Seed Datasets (NSF Awards + MISeD Meeting Dialogs)

1. **Ingest 10,000 NSF Research Awards**:
   ```bash
   uv run python graph/ingest_10k_db.py
   ```

2. **Ingest MISeD Meeting Dialog Dataset (`data/train.json`)**:
   ```bash
   uv run python data/ingest_mised_to_gacm.py
   ```

3. **Verify Combined System Metrics**:
   ```bash
   uv run python graph/verify_step3.py
   ```

---

## 🚀 Step 4: Launch Backend Server (FastAPI)

From the `backend/` folder, start the FastAPI dev server:

```bash
$env:PYTHONIOENCODING="utf-8"
uv run fastapi dev main.py
```

The FastAPI backend will start running at:  
👉 **`http://127.0.0.1:8000`**  
Open API Swagger docs at: `http://127.0.0.1:8000/docs`

---

## 💻 Step 5: Launch Frontend App (Next.js 16)

1. Open a new terminal in the `frontend/` folder:
   ```bash
   cd frontend
   ```

2. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

3. **Start Next.js Development Server**:
   ```bash
   npm run dev
   ```

The Next.js frontend will start running at:  
👉 **`http://localhost:3000`** (or `http://localhost:3001`)

---

## 🌐 Application Navigation Sitemap

- **GACM Interactive AI Explorer**: [http://localhost:3001/gacm](http://localhost:3001/gacm)
- **Institutional Resource Library**: [http://localhost:3001/library](http://localhost:3001/library)
- **Project Topic Spaces & Community**: [http://localhost:3001/community](http://localhost:3001/community)
- **Login / Authentication**: [http://localhost:3001/login](http://localhost:3001/login)
