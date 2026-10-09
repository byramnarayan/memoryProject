import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from contextlib import asynccontextmanager
# asynccontextmanager: for life span function
from fastapi import FastAPI,Request,status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
# RequestValidationError: validation error from exception handler like /hello in place of /34
# JSONResponse: mainly return JSON Resposes
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
# selectinload: eager loading relationship which is super imporant 
# inso the solution is eager

# loading with select and load that we imported earlier. So instead of letting

# SQL Alchemy lazy load relationships when you access them, you explicitly tell SQL

# Alchemy to load them immediately with the main query. And we'll see how to do

# that in just a second.
# query wehere need realtionshio used eager loading 



from database import engine, Base, AsyncSessionLocal
from routers import users, gacm, capture, memory, governance, insights, tenant, employees, connectors, employee_logs, kt_handoff, telecom_analytics
from sqlalchemy import text, select
from models import User
from pwdlib import PasswordHash
import logging

logger = logging.getLogger("uvicorn")

password_hash_mgr = PasswordHash.recommended()

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 1. Automatically create and verify all PostgreSQL database tables on startup
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        # 2. Verify 'users' table schema & fix missing username column if needed
        async with AsyncSessionLocal() as session:
            try:
                res = await session.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users';"))
                cols = [r[0] for r in res.fetchall()]
                if 'username' not in cols and len(cols) > 0:
                    await session.execute(text("DROP TABLE IF EXISTS password_reset_tokens CASCADE;"))
                    await session.execute(text("DROP TABLE IF EXISTS users CASCADE;"))
                    await session.commit()
                    async with engine.begin() as conn:
                        await conn.run_sync(Base.metadata.create_all)

                # 3. Seed default user (CoreyMSchafer: m@m.com / 12345678) if empty
                user_res = await session.execute(select(User).where(User.email == "m@m.com"))
                existing_user = user_res.scalar_one_or_none()
                if not existing_user:
                    hashed = password_hash_mgr.hash("12345678")
                    new_user = User(
                        username="CoreyMSchafer",
                        email="m@m.com",
                        password_hash=hashed,
                        image_file=None
                    )
                    session.add(new_user)
                # 4. Enterprise employee profile schema migrations (Session 10)
                alter_queries = [
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(60);",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(60);",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_number VARCHAR(20);",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(80);",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id);",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS hire_date TIMESTAMPTZ;",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_temporary_password BOOLEAN DEFAULT FALSE;",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';",
                ]
                for q in alter_queries:
                    try:
                        await session.execute(text(q))
                    except Exception:
                        pass
                await session.commit()
            except Exception as inner_e:
                logger.warning(f"Database user init note: {inner_e}")
    except Exception as e:
        logger.warning(f"PostgreSQL connection note during startup: {e}")

    # 5. Initialize Neo4j multi-tenant schema indexes (Session 16)
    try:
        from services.graph_sync_service import ensure_graph_indexes
        ensure_graph_indexes()
    except Exception as ge:
        logger.info(f"Graph index verification note: {ge}")

    yield
    await engine.dispose()

app = FastAPI(lifespan=lifespan)

# Enable CORS for Next.js frontend (ports 3000 & 3001)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Static file mount for media assets
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(gacm.router, prefix="/api/gacm", tags=["gacm"])
app.include_router(capture.router, prefix="/api/capture", tags=["capture"])
app.include_router(memory.router, prefix="/api/memory", tags=["memory"])
app.include_router(governance.router, prefix="/api/governance", tags=["governance"])
app.include_router(insights.router, prefix="/api/insights", tags=["insights"])
app.include_router(tenant.router, prefix="/api/tenant", tags=["tenant"])
app.include_router(tenant.router, prefix="/api/tenants", tags=["tenants"])
app.include_router(employees.router, prefix="/api/employees", tags=["employees"])
app.include_router(connectors.router, prefix="/api/connectors", tags=["connectors"])
app.include_router(employee_logs.router, prefix="/api/logs", tags=["logs"])
app.include_router(kt_handoff.router, prefix="/api/kt", tags=["kt"])
app.include_router(telecom_analytics.router, prefix="/api/enterprise-analytics", tags=["enterprise-analytics"])

from graph.models_gacm import DocumentEmbedding, ResearchMemoryObject
from sqlalchemy import func

@app.get("/", tags=["system"])
async def root():
    """System health & institutional memory metadata endpoint."""
    return {
        "system": "University Institutional Memory as a Service (MaaS/GACM)",
        "version": "1.0.0",
        "status": "operational",
        "domain": "research_university",
        "institution": "University of Tennessee at Chattanooga (UTC)"
    }

@app.get("/api/posts")
async def get_posts(skip: int = 0, limit: int = 10):
    """Provides paginated institutional research updates for the Home feed."""
    async with AsyncSessionLocal() as session:
        # Check canonical ResearchMemoryObject first, fallback to DocumentEmbedding
        mem_count_res = await session.execute(select(func.count(ResearchMemoryObject.id)).where(ResearchMemoryObject.tenant_id == "utc_campus"))
        mem_total = mem_count_res.scalar() or 0

        if mem_total > 0:
            stmt = (
                select(ResearchMemoryObject)
                .where(ResearchMemoryObject.tenant_id == "utc_campus")
                .order_by(ResearchMemoryObject.id.asc())
                .offset(skip)
                .limit(limit)
            )
            res = await session.execute(stmt)
            mems = res.scalars().all()
            posts = []
            for m in mems:
                entities = m.get_entities()
                pi_name = entities.get("pi_name") or "Institutional Researcher"
                posts.append({
                    "id": m.id,
                    "title": m.title,
                    "content": m.raw_text,
                    "user_id": m.user_id,
                    "created_at": m.created_at.isoformat() if m.created_at else "2026-09-01T00:00:00Z",
                    "author": {
                        "id": m.user_id,
                        "username": pi_name,
                        "email": "faculty@utc.edu",
                        "image_path": "/static/profile_pics/default.jpg"
                    }
                })
            return {
                "posts": posts,
                "total": mem_total,
                "skip": skip,
                "limit": limit,
                "has_more": (skip + limit) < mem_total
            }

        # Fallback to legacy document_embeddings if migration is running
        count_res = await session.execute(select(func.count(DocumentEmbedding.id)).where(DocumentEmbedding.user_id == 1))
        total = count_res.scalar() or 0
        stmt = (
            select(DocumentEmbedding)
            .where(DocumentEmbedding.user_id == 1)
            .order_by(DocumentEmbedding.id.asc())
            .offset(skip)
            .limit(limit)
        )
        res = await session.execute(stmt)
        docs = res.scalars().all()
        posts = [
            {
                "id": d.id,
                "title": d.project_title,
                "content": d.abstract,
                "user_id": d.user_id,
                "created_at": d.created_at.isoformat() if d.created_at else "2026-09-01T00:00:00Z",
                "author": {
                    "id": 1,
                    "username": d.faculty_name,
                    "email": "faculty@utc.edu",
                    "image_path": "/static/profile_pics/default.jpg"
                }
            }
            for d in docs
        ]
        return {
            "posts": posts,
            "total": total,
            "skip": skip,
            "limit": limit,
            "has_more": (skip + limit) < total
        }

@app.exception_handler(StarletteHTTPException)
async def general_http_exception_handler(request: Request, exception: StarletteHTTPException):
    return await http_exception_handler(request, exception)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exception: RequestValidationError):
    return await request_validation_exception_handler(request, exception)
