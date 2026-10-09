# encryption can be indecyptio
# but argon2 hash will everytime differnt hash genrate 

from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, status

from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash

from config import settings
from typing import Annotated
# create the database quires 
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import models
from database import get_db


import hashlib
import secrets
import string
# setup password hasher: create password hash with aegon2 with recommed settings piwlib[argon2]
password_hash = PasswordHash.recommended()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/users/token")
# So this token URL has to match our login endpoint path which will be for/ API/
# users/token. So this ooth 2 password bearer ***extracts***
# the token from the authorization header. So when a client sends that, this schema
# extracts that token for us. And a nice s side effect of this is that this enables
# the authorize button in our docs which makes testing authentication a lot
# easier. 


# password hashing function
# take plain text password -> return hash
def hash_password(password: str) -> str:
    return password_hash.hash(password)

# verify 
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)

# genrate password reset token 
def generate_reset_token() -> str:
    """
    Generates a cryptographically secure random string to be used as a one-time password reset token.
    secrets.token_urlsafe(32) creates a URL-safe base64-encoded string, which is perfect for emailing as a link.
    """
    return secrets.token_urlsafe(32)


def hash_reset_token(token: str) -> str:
    """
    Hashes the raw token using SHA-256 before storing it in the database.
    We don't use bcrypt/argon2 here because tokens are highly random (high entropy), 
    so they aren't susceptible to dictionary attacks. SHA-256 is much faster and perfectly safe for this use case.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def generate_temp_password(prefix: str = "Emp") -> str:
    """Generate a clean, readable, secure temporary password (e.g. Emp-8371!Pass)."""
    digits = "".join(secrets.choice(string.digits) for _ in range(4))
    special = "!@#"
    return f"{prefix}-{digits}{secrets.choice(special)}Pass"


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(
            minutes=settings.access_token_expire_minutes,
        )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.secret_key.get_secret_value(),
        algorithm=settings.algorithm,
    )
    return encoded_jwt

#  take token str and return USerID if token is vaild 
# store user ID in sub field when we create the TOKEN
def verify_access_token(token: str) -> str | None:
    """Verify a JWT access token and return the subject (user id) if valid."""
    try:
        payload = jwt.decode(
            token,
            settings.secret_key.get_secret_value(),
            algorithms=[settings.algorithm],
            options={"require": ["exp", "sub"]},
        )
    except jwt.InvalidTokenError:
        return None
    else:
        return payload.get("sub")





# JWT STRECTUE 
# Header: contains the algorithm and type, a 
# payload: which contains our data plus the expiration 
# signature: which proves the token wasn't tampered with. 

# And all three parts are B 64 encoded and separated by dots. The
# signature is created using our secret key. So only our server can create valid token 




# add dependency 
## get_current_user
async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    # get token from authrization header from oauth2_scheme
    db: Annotated[AsyncSession, Depends(get_db)],
    # get databse session 
) -> models.User:
    """
    Retrieves the currently authenticated user based on their JWT token.
    
    This function acts as a FastAPI Dependency. Whenever an endpoint needs to know 
    who is making the request (e.g., creating a post or editing a profile), 
    it can depend on this function.
    
    How it works:
    1. Extracts the token from the request header using `oauth2_scheme`.
    2. Verifies the token to extract the user ID.
    3. Queries the database for the user with that ID.
    4. Returns the User object if everything is valid, else throws an HTTP 401 error.
    """
    
    # 1. Decode the token to get the user ID payload (the "sub" claim)
    user_id = verify_access_token(token)
    
    # If verify_access_token returns None, the token was either tampered with or expired
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Ensure the ID is a valid integer (since our DB IDs are integers)
    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Look up the user in the database
    result = await db.execute(
        select(models.User).where(models.User.id == user_id_int),
    )
    user = result.scalars().first()
    
    # 4. If the user doesn't exist anymore (e.g. they deleted their account), reject the request
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # 5. Success! Return the user model so the endpoint can use it
    return user
# Alies current user 
CurrentUser = Annotated[models.User, Depends(get_current_user)]
# models.user: user object
# Depends() metadata about this user 
# 