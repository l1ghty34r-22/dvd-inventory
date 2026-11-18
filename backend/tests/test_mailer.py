import pytest

from app import mailer
from app.config import settings


class FakeSMTP:
    instances: list["FakeSMTP"] = []

    def __init__(self, host, port, **kwargs):
        self.host, self.port, self.calls = host, port, []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        self.calls.append("starttls")

    def login(self, user, password):
        self.calls.append(("login", user, password))

    def send_message(self, message):
        self.calls.append(("send", message["To"], message["From"], message["Subject"]))
        self.message = message


@pytest.fixture
def smtp(monkeypatch):
    FakeSMTP.instances = []
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(mailer.smtplib, "SMTP_SSL", FakeSMTP)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_username", "mailer@example.com")
    monkeypatch.setattr(settings, "smtp_password", "app-password")
    monkeypatch.setattr(settings, "mail_from", "NeverDisc <no-reply@example.com>")
    return FakeSMTP


def test_sends_with_starttls_on_587(smtp, monkeypatch):
    monkeypatch.setattr(settings, "smtp_port", 587)
    mailer.send_email("you@example.com", "Hi", "plain", "<p>html</p>")
    (conn,) = smtp.instances
    assert (conn.host, conn.port) == ("smtp.example.com", 587)
    assert conn.calls == [
        "starttls",
        ("login", "mailer@example.com", "app-password"),
        ("send", "you@example.com", "NeverDisc <no-reply@example.com>", "Hi"),
    ]
    assert conn.message.get_body(("html",)).get_content().strip() == "<p>html</p>"


def test_port_465_uses_ssl_without_starttls(smtp, monkeypatch):
    monkeypatch.setattr(settings, "smtp_port", 465)
    mailer.send_email("you@example.com", "Hi", "plain")
    assert "starttls" not in smtp.instances[0].calls


def test_without_smtp_dev_prints_and_production_refuses(monkeypatch, capsys):
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "app_env", "development")
    mailer.send_email("you@example.com", "Hi", "the link")
    assert "the link" in capsys.readouterr().out
    monkeypatch.setattr(settings, "app_env", "production")
    with pytest.raises(mailer.MailNotConfiguredError):
        mailer.send_email("you@example.com", "Hi", "the link")
