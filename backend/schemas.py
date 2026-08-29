from pydantic import BaseModel, ConfigDict, Field, EmailStr

notes="""
[ Raw JSON Client Input ]
       │
       ▼
 ┌───────────┐
 │   INPUT   │ Validate data shapes, lengths, types (e.g., string vs integer)
 └─────┬─────┘
       │  If Valid
       ▼
 ┌───────────┐
 │  BACKEND  │ Process logic, auto-generate attributes (e.g., id=10, date="Jul 2026")
 └─────┬─────┘
       │
       ▼
 ┌───────────┐
 │  OUTPUT   │ Strip sensitive values, serialize objects/dicts to pure JSON
 └───────────┘


NOTE FOR BEGINNERS ON SCHEMAS (Pydantic):

Pydantic schemas act as data contracts. They define what data comes IN (PostCreate)
and what data goes OUT (PostResponse). They handle:
  1. Data Validation (validating types like checking if an ID is an integer)
  2. Serialization (converting database objects/dictionaries into clean JSON)
  3. Auto-Documentation (automatically building data shapes for Swagger UI at /docs)
--------------------------------------------------------
NOTE FOR BEGINNERS ON PYDANTIC TOOLS:
1. BaseModel: The core blueprint class. All data schemas inherit from this.
2. Field: Allows you to inject validation constraints (like text length boundaries)
   and custom metadata directly onto schema attributes.
3. ConfigDict: The modern Pydantic v2 setup manager used to change how models behave.
--------------------------------------------------------

"""


class UserBase(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    email: EmailStr = Field(max_length=120)


class UserCreate(UserBase):
    password:str=Field(min_length=8)

# dont want other person to see the author data so created the public and private response 
# class UserResponse(UserBase):
class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username:str
    image_file: str|None
    image_path: str
    # image_path define in model it is not database col from_attributes let read that attribute 

class UserPrivate(UserPublic):
    email:EmailStr
    

class UserUpdate(BaseModel):
    username: str | None= Field(default=None,min_length=1, max_length=50)
    email: EmailStr | None = Field(default=None, max_length=120)
#  need to lock this other user with PATCH endpoint can replace string to enter there image 
#  Profile picture should change only uplaod and delete end point 

#  need token schema for login responses
class Token(BaseModel):
    access_token: str
    token_type: str



## Password Reset Schemas
class ForgotPasswordRequest(BaseModel):
    """
    Schema for step 1 of password reset: The user submits their email.
    Pydantic's EmailStr automatically validates that the input is a properly formatted email address.
    """
    email: EmailStr = Field(max_length=120)


class ResetPasswordRequest(BaseModel):
    """
    Schema for step 2 of password reset: The user submits the token (from their email link) 
    and their desired new password.
    """
    # The raw token extracted from the URL query parameter
    token: str
    
    # The new password, strictly validated to be at least 8 characters long for security
    new_password: str = Field(min_length=8)


class ChangePasswordRequest(BaseModel):
    """
    Schema for changing a password when a user is already logged in.
    They must provide their current password to prove their identity, along with the new password.
    """
    current_password: str
    new_password: str = Field(min_length=8)