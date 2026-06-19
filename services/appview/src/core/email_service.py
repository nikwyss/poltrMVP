import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Literal, Optional

# Email translations keyed by locale. The email carries ONLY the magic link now
# (no short code). The two purposes are STRONGLY contrasted — "new account" vs
# "welcome back" — because that contrast is the only place the user learns whether
# they just registered or logged in.
_EMAIL_STRINGS: dict[str, dict] = {
    "de": {
        "registration": {
            "subject": "Dein neuer POLTR-Account – POLTR",
            "heading": "Neuer Account erstellt",
            "intro": "Willkommen bei POLTR! Klicke auf den Button, um deinen neuen Account zu aktivieren und dich anzumelden:",
            "action_text": "Account aktivieren & anmelden",
            "expiry_text": "10 Minuten",
        },
        "login": {
            "subject": "Willkommen zurück – POLTR",
            "heading": "Willkommen zurück",
            "intro": "Schön, dich wiederzusehen. Klicke auf den Button, um dich anzumelden:",
            "action_text": "Anmelden",
            "expiry_text": "10 Minuten",
        },
        "copy_link": "Oder kopiere diesen Link in deinen Browser:",
        "expires": "Dieser Link läuft in {expiry} ab.",
        "ignore": "Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.",
    },
    "en": {
        "registration": {
            "subject": "Your new POLTR account – POLTR",
            "heading": "New account created",
            "intro": "Welcome to POLTR! Click the button to activate your new account and sign in:",
            "action_text": "Activate account & sign in",
            "expiry_text": "10 minutes",
        },
        "login": {
            "subject": "Welcome back – POLTR",
            "heading": "Welcome back",
            "intro": "Good to see you again. Click the button to sign in:",
            "action_text": "Sign in",
            "expiry_text": "10 minutes",
        },
        "copy_link": "Or copy and paste this link in your browser:",
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
        short_code: str | None = None,  # DEPRECATED: ignored — the email is link-only now
        locale: str = "de",
    ) -> bool:
        """Send a magic-link email for registration or login.

        The email contains ONLY the link. The 6-char short code is never emailed;
        it is shown in-browser and only when the link opens in a different browser.
        """
        try:
            strings = _EMAIL_STRINGS.get(locale, _EMAIL_STRINGS["de"])
            purpose_strings = strings[purpose]
            subject = purpose_strings["subject"]
            heading = purpose_strings["heading"]
            intro = purpose_strings["intro"]
            action_text = purpose_strings["action_text"]
            expiry_text = purpose_strings["expiry_text"]

            # Unified verify page for both purposes (the email text already tells
            # the user which one it is). Referrer-Policy: no-referrer is set on
            # that page so the token does not leak via Referer.
            link = f"{self.frontend_url}/auth/verify?token={token}"

            expires_sentence = strings["expires"].format(expiry=expiry_text)

            # Plain, single-column layout. Inline styles + a table-wrapped button
            # for broad email-client compatibility (incl. Outlook). Brand orange
            # #F29400, muted secondary text; no images, no tracking.
            html_body = f"""\
<!DOCTYPE html>
<html lang="{locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin:0; padding:0; background:#f4f2ef;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ef;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px; background:#ffffff; border-radius:12px;">
            <tr>
              <td style="padding:40px 32px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1a1814;">
                <p style="margin:0 0 6px; font-size:12px; letter-spacing:3px; text-transform:uppercase; color:#9b9691;">POLTR</p>
                <h1 style="margin:0 0 16px; font-family:Georgia,'Times New Roman',serif; font-size:25px; font-weight:600; color:#1a1814;">{heading}</h1>
                <p style="margin:0 0 28px; font-size:15px; line-height:1.55; color:#4a4640;">{intro}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px; background:#F29400;">
                      <a href="{link}" style="display:inline-block; padding:13px 30px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">{action_text}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 6px; font-size:13px; color:#9b9691;">{strings["copy_link"]}</p>
                <p style="margin:0 0 24px; font-size:13px; line-height:1.5; word-break:break-all;"><a href="{link}" style="color:#b07000; text-decoration:none;">{link}</a></p>
                <hr style="border:none; border-top:1px solid #ececea; margin:0 0 20px;">
                <p style="margin:0 0 6px; font-size:13px; color:#9b9691;">{expires_sentence}</p>
                <p style="margin:0; font-size:13px; color:#9b9691;">{strings["ignore"]}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

            text_body = f"""
            {heading}

            {intro}
            {link}

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
                print(f"Email: ****")  # never log the plaintext address (even in dev)
                print(f"Purpose: {purpose}")
                print(f"Link: {link}")
                print(f"{'='*60}\n")

            return True
        except Exception as e:
            print(f"Failed to send email: {e}")
            return False


email_service = EmailService()
