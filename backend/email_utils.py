
## email_utils.py imports
from email.message import EmailMessage

import aiosmtplib
# sending image 
from fastapi.templating import Jinja2Templates

from config import settings


templates = Jinja2Templates(directory="templates")



async def send_email(
    to_email: str,
    subject: str,
    plain_text: str,
    html_content: str | None = None,
) -> None:
    """
    Core function to construct and send an email via SMTP.
    
    Parameters:
    - to_email: The recipient's email address
    - subject: The subject line of the email
    - plain_text: A raw text version of the email (required as a fallback for old email clients)
    - html_content: An optional HTML version for modern, styled emails
    """
    # EmailMessage class helps us easily construct the MIME structure of the email
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = to_email
    message["Subject"] = subject

    # Always set the plain text version first (acts as the primary content/fallback)
    message.set_content(plain_text)

    # If HTML content is provided, add it as an alternative.
    # Modern email clients will prioritize showing the HTML version over the plain text.
    if html_content:
        message.add_alternative(html_content, subtype="html")

    # Sending the message asynchronously via SMTP using server settings from our environment variables
    await aiosmtplib.send(
        message,
        hostname=settings.mail_server,
        port=settings.mail_port,
        username=settings.mail_username or None,
        password=settings.mail_password.get_secret_value() or None, 

        # start_tls upgrades an insecure connection to a secure one using TLS encryption
        start_tls=settings.mail_use_tls,
    )


## send_password_reset_email function
async def send_password_reset_email(to_email: str, username: str, token: str) -> None:
    """
    Specific helper function to prepare and send the password reset email.
    It takes the raw token and injects it into a URL that points back to our frontend.
    """
    # Construct the frontend URL where the user will enter their new password
    reset_url = f"{settings.frontend_url}/reset-password?token={token}"

    # Render the HTML template using Jinja2.
    # get_template() fetches the template file, and .render() injects our variables (reset_url, username) into the HTML string.
    template = templates.env.get_template("email/password_reset.html")
    html_content = template.render(reset_url=reset_url, username=username)

    # Construct the fallback plain text version
    plain_text = f"""Hi {username},

You requested to reset your password. Click the link below to set a new password:

{reset_url}

This link will expire in 1 hour.

If you didn't request this, you can safely ignore this email.

Best regards,
The MnemoGraph Team
"""

    # Call our core send_email function to actually dispatch the message
    await send_email(
        to_email=to_email,
        subject="Reset Your Password - MnemoGraph",
        plain_text=plain_text,
        html_content=html_content,
    )
