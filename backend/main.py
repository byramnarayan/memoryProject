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
from routers import users, gacm
from sqlalchemy import text, select
from models import User
from pwdlib import PasswordHash

password_hash_mgr = PasswordHash.recommended()

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 1. Automatically create and verify all PostgreSQL database tables on startup
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
                await session.commit()
        except Exception as e:
            print(f" [Startup Note]: {e}")

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


app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(gacm.router, prefix="/api/gacm", tags=["gacm"])

# tags: create collapsable sections
# Prefix add that traling slash
#



@app.get("/", include_in_schema=False, name="home")
async def home(request: Request):
    return templates.TemplateResponse(
        request,
        "home.html",
        {
            "title": "Home",
        },
    )
## login and register template_routes
@app.get("/login", include_in_schema=False)
async def login_page(request: Request):
    return templates.TemplateResponse(
        request,
        "login.html",
        {"title": "Login"},
    )


@app.get("/register", include_in_schema=False)
async def register_page(request: Request):
    return templates.TemplateResponse(
        request,
        "register.html",
        {"title": "Register"},
    )



@app.get("/account", include_in_schema=False)
async def account_page(request: Request):
    return templates.TemplateResponse(
        request,
        "account.html",
        {"title": "account"},
    )




## main.py template routes
@app.get("/forgot-password", include_in_schema=False)
async def forgot_password_page(request: Request):
    """
    Renders the forgot password page where users can input their email.
    We pass "title" to the template context to update the browser tab title.
    """
    return templates.TemplateResponse(
        request,
        "forgot_password.html",
        {"title": "Forgot Password"},
    )


@app.get("/reset-password", include_in_schema=False)
async def reset_password_page(request: Request):
    """
    Renders the reset password page where users input their new password.
    This page is accessed via a link sent in an email, which contains a secret token in the URL.
    """
    response = templates.TemplateResponse(
        request,
        "reset_password.html",
        {"title": "Reset Password"},
    )
    # Security Measure: Prevent the browser from sending the secret token in the URL 
    # to other external sites the user might click on from this page.
    response.headers["Referrer-Policy"] = "no-referrer"
    return response













@app.exception_handler(StarletteHTTPException)
async def general_http_exception_handler(request: Request, exception: StarletteHTTPException):
    
    if request.url.path.startswith("/api"):
        return await http_exception_handler(request, exception)
    message = (
            exception.detail
            if exception.detail
            else "An error occurred. Please check your request and try again."
        )

    return templates.TemplateResponse(
        request,
        "error.html",
        {
            "status_code": exception.status_code,
            "title": exception.status_code,
            "message": message,
        },
        status_code=exception.status_code,
    )
    # to get the correct respone for RESTAPI

# handle validation error/posts/hello kind of thing
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exception: RequestValidationError):
    if request.url.path.startswith("/api"):
        return await request_validation_exception_handler(request, exception)

    return templates.TemplateResponse(
        request,
        "error.html",
        {
            "status_code": status.HTTP_422_UNPROCESSABLE_CONTENT,
            "title": status.HTTP_422_UNPROCESSABLE_CONTENT,
            "message": "Invalid request. Please check your input and try again.",
        },
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
    )
