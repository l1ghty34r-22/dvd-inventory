export interface User {
  id: number;
  email: string;
}

export interface Movie {
  id: number;
  tmdb_id: number | null;
  title: string;
  year: number | null;
  poster_url: string | null;
  genres: string[];
  runtime: number | null;
}

export interface MovieSearchResult {
  tmdb_id: number;
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
  added_this_month: number;
  top_genre: string | null;
  oldest: FilmRef | null;
  newest: FilmRef | null;
}

export interface InventoryItem {
  id: number;
  condition: string | null;
  location: string | null;
  notes: string | null;
  added_at: string;
  movie: Movie;
}

export interface InventoryPage {
  items: InventoryItem[];
  total: number;
}

export interface NewInventoryItem {
  title: string;
  year?: number | null;
  tmdb_id?: number | null;
  poster_url?: string | null;
  condition?: string | null;
  location?: string | null;
  notes?: string | null;
}

const TOKEN_KEY = "dvd_inventory_token";

export function getToken(): string | null {
  try {
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

  searchMovies: (q: string) =>
    request<MovieSearchResult[]>(`/movies/search?${new URLSearchParams({ q })}`),

  addItem: (item: NewInventoryItem) => request<InventoryItem>("/inventory", json("POST", item)),

  deleteItem: (id: number) => request<void>(`/inventory/${id}`, { method: "DELETE" }),
};
