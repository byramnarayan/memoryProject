
from pydantic import SecretStr
#  for password and things like that 
from pydantic_settings import BaseSettings, SettingsConfigDict
# same as .env variable 


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )
    database_url:str
    secret_key: SecretStr
    algorithm: str = "HS256" # stdandard for jwt 
    access_token_expire_minutes: int = 30

    max_upload_size_bytes: int = 5*1024*1024  # 5 MB
    posts_per_page:int= 10




    reset_token_expire_minutes: int = 60
    # mail server creditoinal 
    mail_server: str = "localhost"
    mail_port: int = 587
    mail_username: str = ""
    mail_password: SecretStr = SecretStr("")
    #  prevent password from log
    mail_from: str = "noreply@example.com"
    # 
    mail_use_tls: bool = True
    # tells smtplib weahther to use START TLS or Encryption
    frontend_url: str = "http://localhost:8000"
    # base url build for password reset link
    # hard code instsited of requiest because required data can be manupluated bu attacker 





    # S3 Configuration
    s3_bucket_name: str
    s3_region: str = "us-east-1"
    s3_access_key_id: SecretStr | None = None
    s3_secret_access_key: SecretStr | None = None
    s3_endpoint_url: str | None = None

    # AI & Knowledge Graph Configuration
    hf_token: SecretStr | None = None
    kaggle_api_token: SecretStr | None = None
    memgraph_host: str = "localhost"
    memgraph_port: int = 7687
    neo4j_uri: str | None = None
    neo4j_username: str | None = None
    neo4j_password: SecretStr | None = None
    qdrant_url: str | None = None
    qdrant_api_key: SecretStr | None = None

    # API Keys & Models for Rotation & Tool Calling
    groq_api_key_1: SecretStr | None = None
    groq_api_key_2: SecretStr | None = None
    groq_api_key_3: SecretStr | None = None
    groq_model: str = "openai/gpt-oss-120b"
    google_api_key: SecretStr | None = None


settings = Settings()  # type: ignore[call-arg] # Loaded from .env file``




# comes from env varivarable 
# from .env  