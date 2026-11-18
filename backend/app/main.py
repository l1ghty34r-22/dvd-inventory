from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.types import Scope

from app.config import settings
from app.database import Base, engine, upgrade_schema
from app.routers import auth, inventory, movies, password_reset, profile


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Fine for a first version. Replace with Alembic migrations once the schema settles.
    Base.metadata.create_all(bind=engine)
    upgrade_schema(engine)
    yield


app = FastAPI(title="NeverDisc API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(inventory.router)
app.include_router(movies.router)
app.include_router(profile.router)
app.include_router(password_reset.router)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


# In production the built frontend is served from here, so the site is a single service on a
# single address. Mounted last so it never shadows the /api routes.
class SinglePageApp(StaticFiles):
    """Serve index.html for paths like /dashboard/profile, so the frontend can route them."""

    async def get_response(self, path: str, scope: Scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            # Missing files under /api or with an extension (a stale asset) stay real 404s.
            if exc.status_code != 404 or path.startswith("api") or "." in path.rsplit("/", 1)[-1]:
                raise
            return await super().get_response("index.html", scope)


static_dir = Path(settings.static_dir)
if static_dir.is_dir():
    app.mount("/", SinglePageApp(directory=static_dir, html=True), name="frontend")
