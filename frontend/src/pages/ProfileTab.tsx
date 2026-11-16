import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import type { OwnedTitle } from "../api";
import { BarList } from "../components/BarList";
import { CaseCover } from "../components/DvdCase";
import { StatTiles } from "../components/StatTiles";
import { Link } from "../router";

const TOP_GENRES = 10;

function TitleList({ heading, titles }: { heading: string; titles: OwnedTitle[] }) {
  return (
    <section className="panel">
      <h2>
        {heading} <span className="muted count">{titles.length}</span>
      </h2>
      {titles.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="title-list">
          {titles.map((title) => (
            <li key={title.movie_id}>
              <span className="case mini-case">
                <CaseCover title={title.title} posterUrl={title.poster_url} />
              </span>
              <span className="title-list-text">
                <strong>{title.title}</strong>
                <span className="muted">
                  {[title.year, title.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
                </span>
              </span>
              {title.copies > 1 && <span className="copies">×{title.copies}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProfileTab() {
  const profile = useQuery({ queryKey: ["inventory", "profile"], queryFn: api.profile });

  if (profile.isPending) return <p className="muted">Loading your profile…</p>;
  if (profile.isError) {
    return <p className="error">Could not load your profile: {profile.error.message}</p>;
  }

  const p = profile.data;
  const memberSince = new Date(p.member_since).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const hours = Math.round(p.film_minutes / 60);
  const hiddenGenres = p.genres.length - TOP_GENRES;

  return (
    <>
      <div className="section-head">
        <div className="profile-id">
          <span className="avatar" aria-hidden="true">
            {p.email.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1>{p.email}</h1>
            <p className="muted">Collecting since {memberSince}</p>
          </div>
        </div>
      </div>

      <StatTiles
        tiles={[
          { label: "Discs", value: p.total_discs },
          { label: "Films", value: p.films },
          { label: "TV shows", value: p.tv_shows },
          { label: "Hours of film", value: hours },
        ]}
      />

      {p.total_discs === 0 ? (
        <section className="empty">
          <h2>Your profile fills in as you add discs</h2>
          <p className="muted">Genres, decades and every title you own will show up here.</p>
          <Link to="/dashboard/collection" className="button primary">
            Go to my collection
          </Link>
        </section>
      ) : (
        <>
          <div className="profile-grid">
            <section className="panel">
              <h2>Genres</h2>
              <p className="muted panel-note">Titles per genre. A title can have several.</p>
              {p.genres.length === 0 ? (
                <p className="muted">No genre information yet.</p>
              ) : (
                <>
                  <BarList rows={p.genres.slice(0, TOP_GENRES)} unit="title" label="Titles per genre" />
                  {hiddenGenres > 0 && (
                    <p className="muted panel-note">
                      And {hiddenGenres} more {hiddenGenres === 1 ? "genre" : "genres"}.
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="panel">
              <h2>Decades</h2>
              <p className="muted panel-note">Titles by the decade they came out.</p>
              {p.decades.length === 0 ? (
                <p className="muted">No release years yet.</p>
              ) : (
                <BarList rows={p.decades} unit="title" label="Titles per decade" />
              )}
            </section>
          </div>

          <div className="profile-grid">
            <TitleList heading="Films" titles={p.film_titles} />
            <TitleList heading="TV shows" titles={p.tv_titles} />
          </div>
        </>
      )}
    </>
  );
}
