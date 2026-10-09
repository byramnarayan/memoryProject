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
    email: str = Field(max_length=120)


class UserCreate(UserBase):
    password: str = Field(min_length=8)
    role: str = Field(default="Researcher")
    department: str = Field(default="Research Division")
    clearance_level: str = Field(default="Internal")
    tenant_id: str = Field(default="utc_campus")

# dont want other person to see the author data so created the public and private response 
# class UserResponse(UserBase):
class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str = "TenantAdmin"
    department: str = "Research Division"
    clearance_level: str = "HighlyConfidential"
    tenant_id: str = "utc_campus"
    first_name: str | None = None
    last_name: str | None = None
    employee_number: str | None = None
    job_title: str | None = None
    status: str = "Active"
    is_temporary_password: bool = False
    image_file: str | None = None
    image_path: str = "/static/profile_pics/default.jpg"
    # image_path define in model it is not database col from_attributes let read that attribute 

class UserPrivate(UserPublic):
    email: str
    

class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=50)
    email: str | None = Field(default=None, max_length=120)
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
    """
    email: str = Field(max_length=120)


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


# ========================================================
# ENTERPRISE MULTI-TENANT & EMPLOYEE SCHEMAS (Session 10)
# ========================================================

class CompanySetupRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=150)
    tenant_id: str = Field(min_length=2, max_length=50) # e.g. telco_apex
    industry: str = Field(default="Telecom", max_length=50)
    admin_name: str = Field(min_length=2, max_length=100)
    admin_email: str = Field(max_length=120)
    admin_password: str = Field(min_length=8)
    initial_departments: list[str] = [
        "Network Operations",
        "Customer Support",
        "Radio Frequency Engineering",
        "Billing & Finance",
        "Executive Leadership"
    ]


class CompanyTenantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: str
    company_name: str
    industry: str
    plan_tier: str
    admin_email: str


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    code: str = Field(min_length=2, max_length=50)
    description: str | None = None


class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: str
    name: str
    code: str
    description: str | None = None
    employee_count: int = 0


class CustomRoleCreate(BaseModel):
    role_name: str = Field(min_length=2, max_length=50)
    clearance_level: str = Field(default="Internal")
    description: str | None = None
    can_manage_employees: bool = False
    can_manage_connectors: bool = False
    can_curate: bool = False


class CustomRoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: str
    role_name: str
    clearance_level: str
    description: str | None = None
    can_manage_employees: bool
    can_manage_connectors: bool
    can_curate: bool


class EmployeeProvisionRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    work_email: EmailStr
    department: str
    role: str = Field(default="Employee")
    job_title: str = Field(min_length=2, max_length=80)
    clearance_level: str = Field(default="Internal")
    manager_id: int | None = None
    custom_password: str | None = None # If None, temporary password is auto-generated


class EmployeeProvisionResponse(BaseModel):
    id: int
    employee_number: str
    username: str
    work_email: str
    first_name: str
    last_name: str
    department: str
    role: str
    job_title: str
    clearance_level: str
    manager_id: int | None
    temporary_password: str # returned for the HR credential slip
    status: str


class EmployeeListItem(BaseModel):
    id: int
    employee_number: str | None
    username: str
    work_email: str
    first_name: str | None
    last_name: str | None
    department: str
    role: str
    job_title: str | None
    clearance_level: str
    manager_id: int | None
    manager_name: str | None = None
    status: str
    hire_date: str | None = None


class EmployeeStatusUpdate(BaseModel):
    status: str = Field(pattern="^(Active|OnLeave|Terminated)$")