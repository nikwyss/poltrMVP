import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Literal, Optional


class EmailService:
    def __init__(self):
        self.smtp_host = os.getenv("APPVIEW_SMTP_HOST", "localhost")
        self.smtp_port = int(os.getenv("APPVIEW_SMTP_PORT", "587"))
        self.smtp_user = os.getenv("APPVIEW_SMTP_USER", "")
        self.smtp_password = os.getenv("APPVIEW_SMTP_PASSWORD", "")
        self.from_email = os.getenv("APPVIEW_FROM_EMAIL", "noreply@poltr.info")
        self.frontend_url = os.getenv("APPVIEW_FRONTEND_URL", "http://localhost:5173")
        self.use_tls = os.getenv("APPVIEW_SMTP_USE_TLS", "true").lower() == "true"

    def send_confirmation_link(
        self,
        to_email: str,
        token: str,
        purpose: Literal["registration", "login"] = "registration",
    ) -> bool:
        """Send a confirmation link for registration or other purposes"""
        try:
            if purpose == "registration":
                link = f"{self.frontend_url}/auth/verify-registration?token={token}"
                subject = "Confirm your registration - POLTR"
                action_text = "Confirm your account"
                expiry_text = "30 minutes"
            elif purpose == "login":
                link = f"{self.frontend_url}/auth/verify-login?token={token}"
                subject = "Your Magic Link! - POLTR"
                action_text = "Login to POLTR"
                expiry_text = "15 minutes"
            else:
                raise ValueError("Invalid purpose for confirmation link")

            html_body = f"""
            <html>
                <body>
                    <h2>{subject}</h2>
                    <p>Click the button below to {action_text.lower()}:</p>
                    <p><a href="{link}" style="background-color: #0085ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">{action_text}</a></p>
                    <p>Or copy and paste this link in your browser:</p>
                    <p>{link}</p>
                    <p>This link will expire in {expiry_text}.</p>
                    <p>If you didn't request this, you can safely ignore this email.</p>
                </body>
            </html>
            """

            text_body = f"""
            {subject}

            Click the link below to {action_text.lower()}:
            {link}

            This link will expire in {expiry_text}.
            If you didn't request this, you can safely ignore this email.
            """

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.from_email
            msg["To"] = to_email

            part1 = MIMEText(text_body, "plain")
            part2 = MIMEText(html_body, "html")

            msg.attach(part1)
            msg.attach(part2)

            # Send email
            is_dev_mode = self.smtp_host == "localhost" or not (
                self.smtp_user and self.smtp_password
            )

            if not is_dev_mode:
                with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                    if self.use_tls:
                        server.starttls()
                    server.login(self.smtp_user, self.smtp_password)
                    server.send_message(msg)
            else:
                # For development: just log the link
                print(f"\n{'='*60}")
                print(f"EMAIL LINK (dev mode - localhost or no SMTP configured):")
                print(f"Email: {to_email}")
                print(f"Link: {link}")
                print(f"{'='*60}\n")

            return True
        except Exception as e:
            print(f"Failed to send email: {e}")
            return False


email_service = EmailService()
