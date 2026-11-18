# NeverDisc

Keep track of your DVD collection. Add films and TV shows by searching or scanning their barcode,
see them on a shelf, click any case for the story and cast, and see stats on what you own.

**Pages:** a home page explaining the app, separate log-in and sign-up pages, and a dashboard with two tabs:
*My collection* (headline stats, search, add, and the shelf) and *Profile* (films vs. shows,
genres, decades, hours of film, and every title you own).

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

Tap **Scan barcode** on My collection (or in the Add dialog) and point the camera at a disc's
barcode, or type the number in (a USB barcode scanner also works there). The app looks the code
up on [UPCitemdb](https://www.upcitemdb.com/), cleans the product name ("Fury (DVD, 2015)"
becomes "Fury"), picks the most likely title from TMDB (exact title, a year near the one on the
product, TV if the name mentions a season) and opens that title's page: story, cast, and
**Add to my collection**. If it guessed wrong, **Not this one?** lists the other matches. The
barcode is saved with the disc, so scanning it again shows that you already own it.

Each disc also records its **format**: DVD, Blu-ray, or 4K Ultra HD Blu-ray, picked in the
Add dialog's "Your copy" panel (pre-selected when the product name says "Blu-ray" or "4K").
Blu-ray and 4K cases get a coloured band on the shelf, and the profile counts discs per format.

Product names are cached, so each barcode is looked up once. If the lookup service is
unavailable, you type the title instead and the barcode is still saved.

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
    main.py          app setup, CORS, routers, serves the built frontend
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
    router.tsx       tiny history-based router (no dependency)
    pages/           HomePage, LoginPage, SignupPage, DashboardPage, CollectionTab, ProfileTab
    components/      SiteHeader, AddDvdDialog, BarcodeScanner, DvdCase, TitleDetailsDialog,
                     StatTiles, BarList
```

## API

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Get a JWT (OAuth2 password form) |
| GET | `/api/auth/me` | Current user |
| GET | `/api/inventory` | Your DVDs, with `q` (title or barcode), `limit`, `offset` |
| GET | `/api/inventory/stats` | Totals (films, TV shows), top genre, oldest and newest |
| GET | `/api/inventory/profile` | Full breakdown: genres, decades, hours of film, every title |
| GET | `/api/inventory/{id}` | One disc, with description, cast and crew from TMDB |
| POST | `/api/inventory` | Add a DVD (send `tmdb_id` and `media_type` to fill details from TMDB, optional `barcode`) |
| PATCH | `/api/inventory/{id}` | Update condition, location, notes |
| DELETE | `/api/inventory/{id}` | Remove a DVD |
| GET | `/api/movies/search?q=` | Search TMDB films and TV shows (needs `TMDB_API_KEY`) |
| GET | `/api/movies/barcode/{code}` | What a barcode is: your shelf first, then UPCitemdb, with the best TMDB match |
| GET | `/api/movies/{media_type}/{tmdb_id}` | A title's page from TMDB (story, cast), and how many you own |

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
