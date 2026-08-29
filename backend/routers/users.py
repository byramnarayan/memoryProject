from typing import Annotated
from datetime import timedelta,UTC, datetime
# timedelta; for token expriation

from fastapi import APIRouter, Depends, BackgroundTasks,HTTPException, status, UploadFile
from sqlalchemy import func,select
from sqlalchemy import delete as sql_delete
# func: casesentive user query 
from sqlalchemy.ext.asyncio import AsyncSession
# handle invalid image 
from PIL import UnidentifiedImageError
#  run image sync process
from starlette.concurrency import run_in_threadpool
from email_utils import send_password_reset_email
from image_utils import delete_profile_image, process_profile_image,upload_profile_image


import models
from database import get_db
from schemas import ChangePasswordRequest, ForgotPasswordRequest, ResetPasswordRequest, UserCreate, UserPrivate, UserPublic, Token, UserUpdate

from fastapi.security import OAuth2PasswordRequestForm


from auth import (
    CurrentUser,
    create_access_token,
    hash_password,
    # oauth2_scheme,
    # verify_access_token,
    verify_password,
    generate_reset_token,
    hash_reset_token
)

from config import settings


# s3 error handling 
from botocore.exceptions import ClientError

router = APIRouter()


@router.post(
    "",
    response_model=UserPrivate,
    # that specfic user will get user info after user is created 
    status_code=status.HTTP_201_CREATED,
)
async def create_user(user: UserCreate, db: Annotated[AsyncSession, Depends(get_db)]):
    # db:Annotated is dependecy injection this it call hey before createing this function call get_db and pass result as d parameter
    result = await db.execute(
            select(models.User).where(
            func.lower(models.User.username) == user.username.lower()
        ))
        # "RamM"="ramm" check 
        # there user.username is from function parameter 

    # check user name alrady exists 
    existing_user = result.scalars().first()
    # get first user object or None 
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")

    result = await db.execute(
            select(models.User).where(func.lower(models.User.email) == user.email.lower()),
        )
    existing_email = result.scalars().first()
    if existing_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

# need to update how to ceate the user in auth system 
    new_user= models.User(
        username=user.username,# frontend will be shown "RamM"
        email=user.email.lower(),  # email will be lowercased
        password_hash=hash_password(user.password)
    )

    db.add(new_user)
    # stage insert
    await db.commit()
    # saves to databse
    await db.refresh(new_user)
    #  reload to the database
    # commit, refresh: have actual database operation of IO
    return new_user


# LOGIN
@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    #OAuth2PasswordRequestForm: as depency help in parsing login form data
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Look up user by email (case-insensitive)
    # Note: OAuth2PasswordRequestForm uses "username" field, but we treat it as email
    # look up userby email 
    result = await db.execute(
        select(models.User).where(
            func.lower(models.User.email) == form_data.username.lower(),
        ),
    )
    user = result.scalars().first()

    # Verify user exists and password is correct
    # Don't reveal which one failed (security best practice)
    #  user does not exit and password is wrong 
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
#  eveyrting check out 
    # Create access token with user id as subject
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=access_token_expires,
    )
    return Token(access_token=access_token, token_type="bearer")

# "/me": so frontend get he current user 
# @router.get("/me", response_model=UserPrivate)
# async def get_current_user(
#     token: Annotated[str, Depends(oauth2_scheme)],
#     #  oauth2_scheme : extract the token from authrization header
#     db: Annotated[AsyncSession, Depends(get_db)],
# ):
#     """verfiy user and get Get the currently authenticated user id."""
#     user_id = verify_access_token(token)
#     if user_id is None:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Invalid or expired token",
#             headers={"WWW-Authenticate": "Bearer"},
#         )

#     # Validate user_id is a valid integer (defense against malformed JWT)
#     try:
#         user_id_int = int(user_id)
#     except (TypeError, ValueError):
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Invalid or expired token",
#             headers={"WWW-Authenticate": "Bearer"},
#         )
# #  everthing check out look up user and get he user data 
#     result = await db.execute(
#         select(models.User).where(models.User.id == user_id_int),
#     )
#     user = result.scalars().first()
#     if not user:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="User not found",
#             headers={"WWW-Authenticate": "Bearer"},
#         )
#     return user

@router.get("/me", response_model=UserPrivate)
async def get_current_user(current_user:CurrentUser):
    return current_user



## forgot_password endpoint
@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    # request_data: Validates incoming request contains a valid email
    request_data: ForgotPasswordRequest,
    # background_tasks: Allows us to execute tasks (like sending emails) after returning the response, so the user doesn't wait
    background_tasks: BackgroundTasks,
    # db: Our database session dependency
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Step 1: Check if a user with the provided email exists in the database.
    We use func.lower() to make the email lookup case-insensitive.
    """
    result = await db.execute(
        select(models.User).where(
            func.lower(models.User.email) == request_data.email.lower(),
        ),
    )
    user = result.scalars().first()

    # If the user exists, we proceed with the reset process. 
    # If not, we still return the same success message to prevent "Email Enumeration" attacks (hackers guessing emails).
    if user:
        """
        Step 2: Security Measure - Invalidate any previous unused reset tokens for this user 
        so they can't be used maliciously later.
        """
        await db.execute(
            sql_delete(models.PasswordResetToken).where(
                models.PasswordResetToken.user_id == user.id,
            ),
        )

        """
        Step 3: Generate a secure random token (raw token) that we will email to the user.
        We immediately hash this token (token_hash) because we NEVER store raw tokens in the database.
        If the database is compromised, the hacker only gets the hash and cannot use the tokens.
        """
        token = generate_reset_token()
        token_hash = hash_reset_token(token)
        
        # Token expires in a specific timeframe (e.g., 60 minutes) for security
        expires_at = datetime.now(UTC) + timedelta(
            minutes=settings.reset_token_expire_minutes
        )

        """
        Step 4: Save the token hash and expiration to the database.
        """
        reset_token = models.PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        db.add(reset_token)
        await db.commit()

        """
        Step 5: Add the email sending function to background tasks.
        We pass the RAW token here so it can be embedded in the email link.
        """
        background_tasks.add_task(
            send_password_reset_email,
            to_email=user.email,
            username=user.username,
            token=token,
        )

    # Always return a generic message (HTTP 202 Accepted) regardless of whether the email was found.
    return {
        "message": "If an account exists with this email, you will receive password reset instructions."
    }


## reset_password endpoint
@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(
    # request_data: Contains the token from the URL and the user's new password
    request_data: ResetPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Step 1: Hash the raw token provided by the user in the request.
    We must hash it because our database only stores the hashes, not the raw tokens.
    """
    token_hash = hash_reset_token(request_data.token)

    # Query the database to find a matching token hash
    result = await db.execute(
        select(models.PasswordResetToken).where(
            models.PasswordResetToken.token_hash == token_hash,
        ),
    )
    reset_token = result.scalars().first()

    """
    Step 2: Validate the token exists. If it doesn't, it might be made up or already used.
    """
    if not reset_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    """
    Step 3: Validate the token has not expired.
    If it is expired, we delete it from the database to keep it clean and return an error.
    """
    if reset_token.expires_at < datetime.now(UTC):
        await db.delete(reset_token)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    """
    Step 4: Fetch the user associated with this valid token.
    """
    result = await db.execute(
        select(models.User).where(models.User.id == reset_token.user_id),
    )
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    """
    Step 5: Update the user's password. 
    We MUST hash the new password using bcrypt before saving it to the database!
    """
    user.password_hash = hash_password(request_data.new_password)

    """
    Step 6: Security Measure - Delete ALL reset tokens for this user once their password is changed.
    This prevents anyone from using an old token they might have intercepted.
    """
    await db.execute(
        sql_delete(models.PasswordResetToken).where(
            models.PasswordResetToken.user_id == user.id,
        ),
    )

    await db.commit()
    return {
        "message": "Password reset successfully. You can now log in with your new password."
    }



## change_password endpoint
@router.patch("/me/password", status_code=status.HTTP_200_OK)
async def change_password(
    # password_data: Contains current password and new password
    password_data: ChangePasswordRequest,
    # current_user: Validates the user is currently logged in via JWT
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Step 1: Verify the user knows their current password before allowing a change.
    This prevents someone who left their computer unlocked from having their password stolen.
    """
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    """
    Step 2: Hash the new password and update the user record.
    """
    current_user.password_hash = hash_password(password_data.new_password)

    """
    Step 3: Security Measure - Invalidate any pending password reset tokens for this user.
    Since they just changed their password manually, any requested resets are no longer valid.
    """
    await db.execute(
        sql_delete(models.PasswordResetToken).where(
            models.PasswordResetToken.user_id == current_user.id,
        ),
    )

    await db.commit()
    return {"message": "Password changed successfully"}




@router.get("/{user_id}", response_model=UserPublic)
async def get_user(user_id: int, db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(select(models.User).where(models.User.id == user_id))
    user=result.scalars().first()

    if user:
        return user
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found pls check again ")






## update_user
@router.patch("/{user_id}", response_model=UserPrivate)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    #  validate the model people are trying to update the model in database 
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    ):

    # post ownership check   
    if user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this USer",
        )  

    result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
        # checkusername if exit return 400 ERROR
    if user_update.username is not None and user_update.username.lower() != user.username.lower():
        result = await db.execute(
                    select(models.User).where(
                    func.lower(models.User.username) == user_update.username.lower(),
            ),
               )
        existing_user = result.scalars().first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists",
            )
#  usr validation 
    if user_update.email is not None and user_update.email.lower() != user.email.lower():
        result = await db.execute(
                    select(models.User).where(
                    func.lower(models.User.email) == user_update.email.lower(),
                ))
        existing_email = result.scalars().first()
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

    if user_update.username is not None:
        user.username = user_update.username
    if user_update.email is not None:
        user.email = user_update.email.lower()

    await db.commit()
    await db.refresh(user)
    return user

## delete_user
@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, current_user:CurrentUser ,db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = result.scalars().first()
    # post ownership check   
    if user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this user ",
        )  
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )



    old_filename= user.image_file
    await db.delete(user)
    #  notice required the IO bound session 
    # not required in .add session 
    await db.commit()
    # when user id deleted the image also get deleted   
    if old_filename:
        await delete_profile_image(old_filename)




    # seprate end for profile pic


# file uplaod take the multipart form data
# exixts PTACH Endpoint use json

## Upload Profile Picture Endpoint
@router.patch("/{user_id}/picture", response_model=UserPrivate)
async def upload_profile_picture(
    user_id: int,
    file: UploadFile,
    # fastapi type handle FastAPI
    # after process give the multpart data to handle that we have used 
    # UploadFile e.g. file.fillname,. contenttype, reads
    # gives lost of function 
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this user's picture",
        )

    content = await file.read()

    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {settings.max_upload_size_bytes // (1024 * 1024)}MB",
        )

    try:
        #  sync runing CPUBund function :process_profile_image
        # in AWS Return process bytes  
        process_bytes, new_filename = await run_in_threadpool(process_profile_image, content)
    except UnidentifiedImageError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image file. Please upload a valid image (JPEG, PNG, GIF, WebP).",
        ) from err

    old_filename = current_user.image_file

    ## S3 upload try/except for routers/users.py (upload_profile_picture)
    # Upload to S3 (also runs in threadpool via async wrapper)
    try:
        await upload_profile_image(process_bytes, new_filename)
    except ClientError as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload image. Please try again.",
        ) from err


    current_user.image_file = new_filename
    await db.commit()
    await db.refresh(current_user)

    if old_filename:
        await delete_profile_image(old_filename)

    return current_user
# we can't fully trust the content type from upload file? Well, that's why we are validating here with
# Pillow instead. We are actually uh trying to open the file as an image an
# if Pillow can't identify it, then we reject it. And that's a much more reliable check than trusting what the
# client tells us. Okay, so now let's add an endpoint for deleting profile pictures. So users should be able to
# remove their profile picture and go back to the default if they want to. So I will also grab this from my snippet
# here. So delete profile picture endpoint here. This one is a lot shorter. 


## Delete Profile Picture Endpoint
@router.delete("/{user_id}/picture", response_model=UserPrivate)
async def delete_user_picture(
    user_id: int,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this user's picture",
        )

    old_filename = current_user.image_file

    if old_filename is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No profile picture to delete",
        )

    current_user.image_file = None
    await db.commit()
    await db.refresh(current_user)

    await delete_profile_image(old_filename)

    return current_user

