# DVD Inventory

Keep track of your DVD collection. Log in, add films, search your shelf.

**Stack:** FastAPI, SQLAlchemy, PostgreSQL, React, TypeScript, Vite, TanStack Query, Docker, GitHub Actions.

## Run it

You need Docker.

```bash
docker compose up --build
```

- App: http://localhost:5173
- API docs (Swagger): http://localhost:8000/docs

### Film search

Searching for films (with covers, genres and runtime) needs a free API key from
[TMDB](https://www.themoviedb.org/settings/api). Copy `.env.example` to `.env` in this folder,
paste the key in, and restart:

```
TMDB_API_KEY=your-key
```

Without a key the app still works; you type titles in by hand.

## Run without Docker

Backend (uses a local SQLite file by default):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Tests and lint

```bash
cd backend
pytest
ruff check .
```

```bash
cd frontend
npm run build   # type-checks, then builds
```

## Project layout

```
backend/
  app/
    main.py          app setup, CORS, routers
    config.py        settings from environment variables
    database.py      engine and session
    models.py        User, Movie, InventoryItem
    schemas.py       request and response shapes
    security.py      password hashing, JWT
    deps.py          current-user dependency
    tmdb.py          TMDB API client
    routers/         auth, inventory (with stats), movies (TMDB search)
  tests/             pytest, runs on in-memory SQLite
frontend/
  src/
    api.ts           typed API client
    auth.tsx         login state
    pages/           LoginPage, InventoryPage
    components/      AddDvdDialog, DvdCase, StatsLine
```

## API

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Get a JWT (OAuth2 password form) |
| GET | `/api/auth/me` | Current user |
| GET | `/api/inventory` | Your DVDs, with `q`, `limit`, `offset` |
| GET | `/api/inventory/stats` | Totals, top genre, oldest and newest film |
| POST | `/api/inventory` | Add a DVD (send `tmdb_id` to fill details from TMDB) |
| PATCH | `/api/inventory/{id}` | Update condition, location, notes |
| DELETE | `/api/inventory/{id}` | Remove a DVD |
| GET | `/api/movies/search?q=` | Search TMDB (needs `TMDB_API_KEY`) |

## Roadmap

- [x] Login and personal inventory
- [x] Film search with covers, genres and runtime from TMDB
- [x] Home screen: shelf of covers, collection summary, empty state
- [ ] Barcode scanning from the phone camera
- [ ] Cover photo recognition with a vision model, as a fallback when there is no barcode
- [ ] Alembic migrations
- [ ] Frontend tests (Vitest)
- [ ] Cloud deployment

## Credits

Film details and covers come from [TMDB](https://www.themoviedb.org/). This product uses the TMDB
API but is not endorsed or certified by TMDB.
