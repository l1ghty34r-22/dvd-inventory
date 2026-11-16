# DVD Inventory

Keep track of your DVD collection. Log in, add films and TV shows by searching or scanning
their barcode, search your shelf.

**Stack:** FastAPI, SQLAlchemy, PostgreSQL, React, TypeScript, Vite, TanStack Query, Docker, GitHub Actions.

## Run it

You need Docker.

```bash
docker compose up --build
```

- App: http://localhost:5173
- API docs (Swagger): http://localhost:8000/docs

### Film and TV search

Searching for films and TV shows (with covers, genres and runtime) needs a free API key from
[TMDB](https://www.themoviedb.org/settings/api). Copy `.env.example` to `.env` in this folder,
paste the key in, and restart:

```
TMDB_API_KEY=your-key
```

Without a key the app still works; you type titles in by hand.

### Barcode scanning

In the Add dialog, tap **Scan barcode** to read a disc's barcode with the phone or laptop camera,
or type the number in (a USB barcode scanner also works there). The app looks the code up on
[UPCitemdb](https://www.upcitemdb.com/), cleans the product name ("Friends: The Complete First
Season (DVD)" becomes "Friends") and searches for it, so you pick the right title. The barcode is
saved with the disc, so scanning it again later finds it on your shelf without a lookup.

- Browsers only allow the camera on HTTPS pages or on `localhost`. To scan with a phone against
  your dev machine, use the deployed site or an HTTPS tunnel.
- UPCitemdb's free tier needs no key and allows about 100 lookups a day (and a few per minute).
  For more, set `UPCITEMDB_USER_KEY` to a paid key.

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

## Deploy

The `Dockerfile` in this folder builds one production image that serves both the frontend and
the API, so the whole app runs as a single web service.

1. Create a free PostgreSQL database (for example on [Neon](https://neon.com)) and copy its
   connection string.
2. Create a web service from this repository on a Docker host (for example
   [Render](https://render.com)), using the root `Dockerfile`.
3. Set these environment variables on the service:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the PostgreSQL connection string |
| `SECRET_KEY` | a long random string |
| `TMDB_API_KEY` | your TMDB key |
| `UPCITEMDB_USER_KEY` | optional, a paid UPCitemdb key for more barcode lookups |

The app refuses to start in production without a real `SECRET_KEY`. Health check path:
`/api/health`.

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
    tmdb.py          TMDB API client (films and TV)
    barcodes.py      barcode checks, UPCitemdb lookup, product-name cleaning
    routers/         auth, inventory (with stats), movies (TMDB search, barcode lookup)
  tests/             pytest, runs on in-memory SQLite
frontend/
  src/
    api.ts           typed API client
    auth.tsx         login state
    pages/           LoginPage, InventoryPage
    components/      AddDvdDialog, BarcodeScanner, DvdCase, StatsLine
```

## API

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Get a JWT (OAuth2 password form) |
| GET | `/api/auth/me` | Current user |
| GET | `/api/inventory` | Your DVDs, with `q` (title or barcode), `limit`, `offset` |
| GET | `/api/inventory/stats` | Totals, top genre, oldest and newest film |
| POST | `/api/inventory` | Add a DVD (send `tmdb_id` and `media_type` to fill details from TMDB, optional `barcode`) |
| PATCH | `/api/inventory/{id}` | Update condition, location, notes |
| DELETE | `/api/inventory/{id}` | Remove a DVD |
| GET | `/api/movies/search?q=` | Search TMDB films and TV shows (needs `TMDB_API_KEY`) |
| GET | `/api/movies/barcode/{code}` | What a barcode is: your shelf first, then UPCitemdb |

## Roadmap

- [x] Login and personal inventory
- [x] Film search with covers, genres and runtime from TMDB
- [x] TV shows alongside films
- [x] Home screen: shelf of covers, collection summary, empty state
- [x] Barcode scanning from the phone camera
- [ ] Cover photo recognition with a vision model, as a fallback when there is no barcode
- [ ] Alembic migrations
- [ ] Frontend tests (Vitest)
- [x] Cloud deployment (single Docker image)

## Credits

Film and TV details and covers come from [TMDB](https://www.themoviedb.org/). This product uses the TMDB
API but is not endorsed or certified by TMDB.
