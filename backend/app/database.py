from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
# pool_pre_ping reconnects cleanly when a hosted database has gone to sleep.
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def upgrade_schema(bind: Engine) -> None:
    """Bring a database created by an older version of the app up to date.

    create_all() only creates missing tables, never changes existing ones. Until the project
    moves to Alembic, these steps cover the changes since the first release. Each one checks
    first, so running it again is harmless.
    """
    inspector = inspect(bind)
    tables = inspector.get_table_names()
    with bind.begin() as conn:
        if "movies" in tables:
            columns = {column["name"] for column in inspector.get_columns("movies")}
            if "media_type" not in columns:
                conn.execute(
                    text(
                        "ALTER TABLE movies ADD COLUMN media_type VARCHAR(10) "
                        "NOT NULL DEFAULT 'movie'"
                    )
                )
            indexes = {index["name"]: index for index in inspector.get_indexes("movies")}
            # The first release made tmdb_id unique on its own. TV ids clash with film ids.
            old = indexes.get("ix_movies_tmdb_id")
            if old is not None and old.get("unique"):
                conn.execute(text("DROP INDEX ix_movies_tmdb_id"))
                conn.execute(text("CREATE INDEX ix_movies_tmdb_id ON movies (tmdb_id)"))
            if "uq_movies_media_tmdb" not in indexes:
                conn.execute(
                    text("CREATE UNIQUE INDEX uq_movies_media_tmdb ON movies (media_type, tmdb_id)")
                )

        if "users" in tables:
            columns = {column["name"] for column in inspector.get_columns("users")}
            new_columns = {
                "token_version": "INTEGER NOT NULL DEFAULT 0",
                "totp_secret": "VARCHAR(64)",
                "totp_enabled": "BOOLEAN NOT NULL DEFAULT FALSE",
                "totp_last_step": "INTEGER",
                "recovery_codes": "JSON",
            }
            for name, definition in new_columns.items():
                if name not in columns:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {definition}"))

        if "inventory_items" in tables:
            columns = {column["name"] for column in inspector.get_columns("inventory_items")}
            if "barcode" not in columns:
                conn.execute(text("ALTER TABLE inventory_items ADD COLUMN barcode VARCHAR(13)"))
                conn.execute(
                    text("CREATE INDEX ix_inventory_items_barcode ON inventory_items (barcode)")
                )
            if "format" not in columns:
                conn.execute(
                    text(
                        "ALTER TABLE inventory_items ADD COLUMN format VARCHAR(10) "
                        "NOT NULL DEFAULT 'dvd'"
                    )
                )


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
