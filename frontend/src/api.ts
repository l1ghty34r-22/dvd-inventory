export interface User {
  id: number;
  email: string;
}

export type MediaType = "movie" | "tv";

export type DiscFormat = "dvd" | "bluray" | "uhd";

export const FORMAT_LABELS: Record<DiscFormat, string> = {
  dvd: "DVD",
  bluray: "Blu-ray",
  uhd: "4K Ultra HD Blu-ray",
};

export interface Movie {
  id: number;
  media_type: MediaType;
  tmdb_id: number | null;
  title: string;
  year: number | null;
  poster_url: string | null;
  genres: string[];
  runtime: number | null;
}

export interface MovieSearchResult {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  year: number | null;
  poster_url: string | null;
}

export interface FilmRef {
  title: string;
  year: number;
}

export interface InventoryStats {
  total: number;
  films: number;
  tv_shows: number;
  added_this_month: number;
  top_genre: string | null;
  oldest: FilmRef | null;
  newest: FilmRef | null;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface OwnedTitle {
  movie_id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  genres: string[];
  copies: number;
}

export interface ProfileStats {
  email: string;
  member_since: string;
  total_discs: number;
  /** Counted per title, not per copy. */
  films: number;
  tv_shows: number;
  film_minutes: number;
  genres: NamedCount[];
  decades: NamedCount[];
  /** Discs per format, formats with none left out. */
  formats: NamedCount[];
  film_titles: OwnedTitle[];
  tv_titles: OwnedTitle[];
}

export interface InventoryItem {
  id: number;
  barcode: string | null;
  format: DiscFormat;
  condition: string | null;
  location: string | null;
  notes: string | null;
  added_at: string;
  movie: Movie;
}

export interface CastMember {
  name: string;
  character: string | null;
  photo_url: string | null;
}

export interface TitleDetails {
  overview: string | null;
  tagline: string | null;
  release_date: string | null;
  cast: CastMember[];
  /** "Directed by" or "Created by". */
  crew_label: string;
  crew: string[];
  seasons: number | null;
  episodes: number | null;
}

export interface InventoryItemDetails {
  item: InventoryItem;
  details: TitleDetails | null;
  details_error: string | null;
}

/** The parts of a disc you can change after adding it. */
export interface InventoryItemChanges {
  format?: DiscFormat;
  location?: string | null;
  condition?: string | null;
}

export interface InventoryPage {
  items: InventoryItem[];
  total: number;
}

export interface NewInventoryItem {
  title: string;
  year?: number | null;
  tmdb_id?: number | null;
  media_type?: MediaType;
  poster_url?: string | null;
  barcode?: string | null;
  format?: DiscFormat;
  condition?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface BarcodeLookup {
  barcode: string;
  /** The shop database's product name, e.g. "Heat (DVD, 1995, Widescreen)". */
  product_title: string | null;
  /** A cleaned-up title to search for, e.g. "Heat". */
  title_guess: string | null;
  /** The title already on your shelf with this barcode. */
  match: Movie | null;
  owned_count: number;
  /** Set when the barcode database could not be asked; the barcode can still be saved. */
  lookup_error: string | null;
  /** Read from the product name, or the format of the copy you already own. */
  format_guess: DiscFormat | null;
  /** The title this barcode most likely is. */
  best_match: MovieSearchResult | null;
  /** Other plausible titles, for "Not this one?". */
  candidates: MovieSearchResult[];
}

export interface TitlePreview {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  year: number | null;
  poster_url: string | null;
  genres: string[];
  runtime: number | null;
  details: TitleDetails;
  owned_count: number;
}

const TOKEN_KEY = "neverdisc_token";
// Saved by the app before it was renamed; moved over so nobody is logged out by the rename.
const OLD_TOKEN_KEY = "dvd_inventory_token";

export function getToken(): string | null {
  try {
    const old = localStorage.getItem(OLD_TOKEN_KEY);
    if (old !== null) {
      if (localStorage.getItem(TOKEN_KEY) === null) localStorage.setItem(TOKEN_KEY, old);
      localStorage.removeItem(OLD_TOKEN_KEY);
    }
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable (private mode); the session just won't persist.
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { ...init, headers });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail[0]?.msg ?? message;
    } catch {
      // Not a JSON error body; keep the status text.
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const api = {
  register: (email: string, password: string) =>
    request<User>("/auth/register", json("POST", { email, password })),

  // The backend login endpoint follows the OAuth2 password flow, which is form-encoded.
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: new URLSearchParams({ username: email, password }),
    }),

  me: () => request<User>("/auth/me"),

  listInventory: (q: string) =>
    request<InventoryPage>(
      `/inventory?${new URLSearchParams(q ? { q, limit: "100" } : { limit: "100" })}`,
    ),

  stats: () => request<InventoryStats>("/inventory/stats"),

  profile: () => request<ProfileStats>("/inventory/profile"),

  searchMovies: (q: string) =>
    request<MovieSearchResult[]>(`/movies/search?${new URLSearchParams({ q })}`),

  lookupBarcode: (code: string) =>
    request<BarcodeLookup>(`/movies/barcode/${encodeURIComponent(code)}`),

  previewTitle: (mediaType: MediaType, tmdbId: number) =>
    request<TitlePreview>(`/movies/${mediaType}/${tmdbId}`),

  addItem: (item: NewInventoryItem) => request<InventoryItem>("/inventory", json("POST", item)),

  updateItem: (id: number, changes: InventoryItemChanges) =>
    request<InventoryItem>(`/inventory/${id}`, json("PATCH", changes)),

  getItem: (id: number) => request<InventoryItemDetails>(`/inventory/${id}`),

  deleteItem: (id: number) => request<void>(`/inventory/${id}`, { method: "DELETE" }),
};
