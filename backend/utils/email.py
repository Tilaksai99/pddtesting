import os
import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from dotenv import load_dotenv
import logging

load_dotenv()
logger = logging.getLogger(__name__)

# In-memory OTP storage.
# Format: { "email": {"otp": "123456", "expires_at": datetime} }
OTP_STORE = {}


def generate_otp(length=6) -> str:
    """Generate a random 6-digit numeric OTP."""
    return ''.join(random.choices(string.digits, k=length))


def store_otp(email: str, otp: str, expire_minutes: int = 10):
    """Store OTP with expiration time."""
    OTP_STORE[email] = {
        "otp": otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=expire_minutes)
    }


def verify_otp(email: str, otp: str) -> bool:
    """Check OTP is correct and not expired. Deletes it after use."""
    record = OTP_STORE.get(email)
    if not record:
        return False
    if datetime.utcnow() > record["expires_at"]:
        del OTP_STORE[email]
        return False
    if record["otp"] == otp:
        del OTP_STORE[email]
        return True
    return False


def send_otp_email(to_email: str, otp: str, user_name: str = "User") -> bool:
    """
    Sends OTP email via Gmail SMTP.
    Requires in .env:
        SMTP_SERVER=smtp.gmail.com
        SMTP_PORT=587
        SMTP_USERNAME=yourapp@gmail.com
        SMTP_PASSWORD=xxxx xxxx xxxx xxxx   ← Gmail App Password (not your login password)
    """
    smtp_server = os.getenv("SMTP_SERVER", "")
    smtp_port   = os.getenv("SMTP_PORT", "587")
    smtp_user   = os.getenv("SMTP_USERNAME", "")
    smtp_pass   = os.getenv("SMTP_PASSWORD", "")

    # -----------------------------------------------------------
    # Dev mode: if SMTP is not configured, print OTP to terminal
    # -----------------------------------------------------------
    if not smtp_user or not smtp_pass or not smtp_server:
        logger.warning("SMTP not configured — printing OTP to console (dev mode).")
        print(f"\n{'='*45}")
        print(f"  📧 OTP for {to_email}")
        print(f"  OTP: {otp}  (valid 10 minutes)")
        print(f"{'='*45}\n")
        return True

    # -----------------------------------------------------------
    # Production: send real email
    # -----------------------------------------------------------
    try:
        msg = MIMEMultipart("alternative")
        msg["From"]    = f"Medical Coding Assistant <{smtp_user}>"
        msg["To"]      = to_email
        msg["Subject"] = "Your Password Reset OTP"

        # Plain text fallback
        text_body = (
            f"Hello {user_name},\n\n"
            f"Your OTP for password reset is: {otp}\n"
            f"It will expire in 10 minutes.\n\n"
            f"If you did not request this, please ignore this email.\n\n"
            f"Medical Coding Assistant"
        )

        # HTML version
        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 30px;">
            <div style="max-width: 480px; margin: auto; background: white;
                        border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <h2 style="color: #2c3e50; margin-bottom: 4px;">Password Reset</h2>
                <p style="color: #555;">Hello <strong>{user_name}</strong>,</p>
                <p style="color: #555;">Use the OTP below to reset your password.
                   It expires in <strong>10 minutes</strong>.</p>

                <div style="text-align: center; margin: 28px 0;">
                    <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px;
                                 color: #2980b9; background: #eaf4fb; padding: 14px 28px;
                                 border-radius: 8px;">{otp}</span>
                </div>

                <p style="color: #888; font-size: 13px;">
                    If you did not request a password reset, please ignore this email.
                    Your account is safe.
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
                <p style="color: #aaa; font-size: 12px; text-align: center;">
                    Medical Coding Assistant
                </p>
            </div>
        </body>
        </html>
        """

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        server = smtplib.SMTP(smtp_server, int(smtp_port))
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()

        logger.info(f"✅ OTP email sent to {to_email}")
        return True

    except smtplib.SMTPAuthenticationError:
        logger.error(
            "❌ SMTP authentication failed. "
            "Make sure SMTP_PASSWORD is a Gmail App Password, not your login password. "
            "See: myaccount.google.com → Security → App passwords"
        )
        return False
    except smtplib.SMTPException as e:
        logger.error(f"❌ SMTP error sending OTP email: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Unexpected error sending email: {e}")
        return False