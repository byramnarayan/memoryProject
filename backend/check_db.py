import asyncio
import selectors
from sqlalchemy import text
from database import AsyncSessionLocal

async def check_relational_db():
    async with AsyncSessionLocal() as session:
        # Get all table names in public schema
        res = await session.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public';"))
        tables = [r[0] for r in res.fetchall()]
        
        print("==========================================================")
        print("STANDARD POSTGRESQL RELATIONAL TABLES (Database: community)")
        print("==========================================================")
        for t in tables:
            # Exclude vector embedding table
            if t == 'document_embeddings':
                continue
            cnt_res = await session.execute(text(f'SELECT count(*) FROM "{t}";'))
            cnt = cnt_res.scalar()
            print(f" Table: {t:<25} | Total Records: {cnt}")
        
        print("==========================================================")
        print("\n[USER ACCOUNTS: users table]")
        users_res = await session.execute(text("SELECT id, username, email FROM users ORDER BY id;"))
        for u in users_res.fetchall():
            print(f"  - ID: {u[0]} | Username: {u[1]:<16} | Email: {u[2]}")

        print("\n[PASSWORD RESET TOKENS: password_reset_tokens table]")
        tokens_res = await session.execute(text("SELECT id, user_id, expires_at FROM password_reset_tokens ORDER BY id;"))
        tokens = tokens_res.fetchall()
        if not tokens:
            print("  - (No password reset tokens active)")
        for tok in tokens:
            print(f"  - Token ID: {tok[0]} | User ID: {tok[1]} | Expires At: {tok[2]}")
        print("==========================================================")

if __name__ == "__main__":
    asyncio.run(check_relational_db(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
