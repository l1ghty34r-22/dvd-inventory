"""Sending email over SMTP (standard library only, so any provider works).

Set SMTP_HOST (and usually SMTP_USERNAME / SMTP_PASSWORD / MAIL_FROM) to turn it on. Without
SMTP_HOST, development prints each email to the log instead of sending it.
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger("neverdisc.mail")


class MailNotConfiguredError(Exception):
    """No SMTP server is set, so emails can't be sent."""


def is_configured() -> bool:
    return bool(settings.smtp_host)


def send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
    if not is_configured():
        if settings.app_env == "production":
            raise MailNotConfiguredError("Email sending is not set up (SMTP_HOST is empty)")
        # Development: show the email in the server log so the flow can be tried out.
        log.warning("Email not sent (no SMTP_HOST). To: %s | Subject: %s\n%s", to, subject, text)
        print(f"\n--- email to {to}: {subject} ---\n{text}\n--- end of email ---\n", flush=True)
        return

    message = EmailMessage()
    message["From"] = settings.mail_from or settings.smtp_username
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")

    context = ssl.create_default_context()
    if settings.smtp_port == 465:
        # Port 465: TLS from the start.
        with smtplib.SMTP_SSL(settings.smtp_host, 465, context=context, timeout=20) as smtp:
            _login_and_send(smtp, message)
    else:
        # Port 587 (or 25): plain connection upgraded with STARTTLS.
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
            smtp.starttls(context=context)
            _login_and_send(smtp, message)


def _login_and_send(smtp: smtplib.SMTP, message: EmailMessage) -> None:
    if settings.smtp_username:
        smtp.login(settings.smtp_username, settings.smtp_password)
    smtp.send_message(message)
