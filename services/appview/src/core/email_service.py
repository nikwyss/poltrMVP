import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Literal, Optional

# Email translations keyed by locale
_EMAIL_STRINGS: dict[str, dict] = {
    "de": {
        "registration": {
            "subject": "Registrierung bestätigen – POLTR",
            "action_text": "Konto bestätigen",
            "expiry_text": "30 Minuten",
        },
        "login": {
            "subject": "Dein Magic Link! – POLTR",
            "action_text": "Bei POLTR anmelden",
            "expiry_text": "15 Minuten",
        },
        "click_below": "Klicke auf den Button, um fortzufahren:",
        "copy_link": "Oder kopiere diesen Link in deinen Browser:",
        "short_code_hint": "Oder gib diesen Code auf der Anmeldeseite ein:",
        "expires": "Dieser Link läuft in {expiry} ab.",
        "ignore": "Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.",
    },
    "en": {
        "registration": {
            "subject": "Confirm your registration – POLTR",
            "action_text": "Confirm your account",
            "expiry_text": "30 minutes",
        },
        "login": {
            "subject": "Your Magic Link! – POLTR",
            "action_text": "Login to POLTR",
            "expiry_text": "15 minutes",
        },
        "click_below": "Click the button below to continue:",
        "copy_link": "Or copy and paste this link in your browser:",
        "short_code_hint": "Or enter this code on the login page:",
        "expires": "This link will expire in {expiry}.",
        "ignore": "If you didn't request this, you can safely ignore this email.",
    },
}


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
        short_code: str | None = None,
        locale: str = "de",
    ) -> bool:
        """Send a confirmation link (and optional short code) for registration or login"""
        try:
            strings = _EMAIL_STRINGS.get(locale, _EMAIL_STRINGS["de"])
            purpose_strings = strings[purpose]
            subject = purpose_strings["subject"]
            action_text = purpose_strings["action_text"]
            expiry_text = purpose_strings["expiry_text"]

            if purpose == "registration":
                link = f"{self.frontend_url}/auth/verify-registration?token={token}"
            elif purpose == "login":
                link = f"{self.frontend_url}/auth/verify-login?token={token}"
            else:
                raise ValueError("Invalid purpose for confirmation link")

            short_code_html = ""
            short_code_text = ""
            if short_code:
                short_code_html = f"""
                    <p style="margin-top: 24px; color: #666;">{strings["short_code_hint"]}</p>
                    <p style="font-size: 32px; font-family: monospace; letter-spacing: 8px;
                              font-weight: bold; text-align: center; padding: 16px;
                              background: #f5f5f5; border-radius: 8px; margin: 8px 0;">
                        {short_code}
                    </p>
                """
                short_code_text = f"\n            {strings['short_code_hint']} {short_code}\n"

            expires_sentence = strings["expires"].format(expiry=expiry_text)

            html_body = f"""
            <html>
                <body>
                    <h2>{subject}</h2>
                    <p>{strings["click_below"]}</p>
                    <p><a href="{link}" style="background-color: #0085ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">{action_text}</a></p>
                    <p>{strings["copy_link"]}</p>
                    <p>{link}</p>
                    {short_code_html}
                    <p>{expires_sentence}</p>
                    <p>{strings["ignore"]}</p>
                </body>
            </html>
            """

            text_body = f"""
            {subject}

            {strings["click_below"]}
            {link}
            {short_code_text}
            {expires_sentence}
            {strings["ignore"]}
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
                if short_code:
                    print(f"Short Code: {short_code}")
                print(f"{'='*60}\n")

            return True
        except Exception as e:
            print(f"Failed to send email: {e}")
            return False


email_service = EmailService()
