from __future__ import annotations
from datetime import UTC, datetime
from sqlalchemy import DateTime, ForeignKey, String, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
from config import settings
# ========================================================
# NOTE ON FORWARD REFERENCES:
# The `from __future__ import annotations` import at the top is the magic trick 
# that allows the `User` class to reference the `Post` class before Python has 
# actually evaluated the `Post` code block lower down in the file.
# ========================================================

class User(Base):
    """
        Represents the database structure for application Users.
        Handles user profiles, images, and maps relationships to their posts.
    """
    __tablename__="users"
    id: Mapped[int]= mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str]= mapped_column(String(50), unique= True, nullable= False)
    email: Mapped[str]= mapped_column(String(120), unique= True, nullable= False)

    # Decoupling Data: Saving just the filename string in the database means if we move our 
    # folder structure from local storage to an AWS S3 cloud bucket later, the database stays untouched!
    image_file: Mapped[str| None]= mapped_column(
        String(120), nullable=True, default=None
    )

    # need to add th passwored hased
    password_hash: Mapped[str]= mapped_column(String(200), nullable=False)

    

    
    ## User.reset_tokens relationship
    reset_tokens: Mapped[list[PasswordResetToken]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    
    @property
    def  image_path(self)-> str:
        """
        A helper property that computes the visual layout file path dynamically.
        Separates data storage logic from user presentation layer logic.
        """
        if self.image_file:
            return f"https://{settings.s3_bucket_name}.s3.{settings.s3_region}.amazonaws.com/profile_pics/{self.image_file}"
        return "/static/profile_pics/default.jpg" 





### database model for password reset token 
## PasswordResetToken model
class PasswordResetToken(Base):
    """
    Database Model for storing Password Reset Tokens.
    We use a separate table instead of storing tokens on the User model to allow for 
    tracking token expiration dates and potentially supporting multiple active tokens.
    """
    __tablename__ = "password_reset_tokens"
    
    # primary key: unique identifier for each token record
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    
    # foreign key: Links this token to the specific user who requested the reset.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    # token_hash: VERY IMPORTANT. We NEVER store the raw token in the database.
    # We store a hashed version (SHA-256). When the user clicks the link, we hash
    # the token from the URL and compare it to this stored hash.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    
    # expires_at: Tokens should have a short lifespan (e.g., 1 hour) to minimize the
    # window an attacker has to use a compromised link.
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    
    # created_at: Automatically records when the reset was requested. Useful for audits.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    # SQLAlchemy Relationship: Allows us to easily access the User object from a token (token.user)
    # and all tokens from a user (user.reset_tokens).
    user: Mapped[User] = relationship(back_populates="reset_tokens")



# =====================================================================
# FASTAPI BACKGROUND TASKS - NOTES & BEST PRACTICES
# =====================================================================
#
# 1. Purpose & Performance:
#    - Long-running operations (like sending emails) involve time-consuming
#      communication between servers.
#    - Background tasks prevent the user from waiting by returning an HTTP 
#      response immediately while the task runs in the background.
#
# 2. Execution Flow:
#    - FastAPI returns the response to the client FIRST.
#    - The background task is executed AFTER the response is sent.
#
# 3. Limitations & Reliability:
#    - Tasks are non-persistent: If the server crashes, any pending 
#      background tasks are lost.
#    - Ideal for non-critical tasks (e.g., password reset emails, where 
#      the user can simply request another one if it fails).
#    - For critical operations requiring guaranteed execution, use a 
#      dedicated task queue (e.g., Celery).
# =====================================================================
