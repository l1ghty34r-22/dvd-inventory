import type { MediaType, TitleDetails } from "../api";
import { CaseCover } from "./DvdCase";

export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export interface TitleBasics {
  title: string;
  year: number | null;
  media_type: MediaType;
  poster_url: string | null;
  genres: string[];
  runtime: number | null;
}

/** Cover, title, facts, genres, tagline and director/creators. */
export function TitleHeader({ title, details }: { title: TitleBasics; details: TitleDetails | null }) {
  const isTv = title.media_type === "tv";
  const facts = [
    title.year,
    isTv ? "TV series" : "Film",
    details?.seasons &&
      `${details.seasons} ${details.seasons === 1 ? "season" : "seasons"}` +
        (details.episodes ? `, ${details.episodes} episodes` : ""),
    title.runtime && (isTv ? `${title.runtime} min episodes` : formatRuntime(title.runtime)),
  ].filter(Boolean);

  return (
    <div className="details-top">
      <div className="case details-cover">
        <CaseCover title={title.title} posterUrl={title.poster_url} />
      </div>
      <div className="details-heading">
        <h2>{title.title}</h2>
        <p className="muted">{facts.join(" · ")}</p>
        {title.genres.length > 0 && (
          <ul className="chips" aria-label="Genres">
            {title.genres.map((genre) => (
              <li key={genre}>{genre}</li>
            ))}
          </ul>
        )}
        {details?.tagline && <p className="tagline">“{details.tagline}”</p>}
        {details && details.crew.length > 0 && (
          <p>
            <span className="muted">{details.crew_label} </span>
            {details.crew.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

/** Story and cast. */
export function TitleBody({ details }: { details: TitleDetails }) {
  return (
    <>
      {details.overview && (
        <section className="details-section">
          <h3>Story</h3>
          <p>{details.overview}</p>
        </section>
      )}

      {details.cast.length > 0 && (
        <section className="details-section">
          <h3>Cast</h3>
          <ul className="cast">
            {details.cast.map((person) => (
              <li key={`${person.name}-${person.character}`}>
                {person.photo_url ? (
                  <img src={person.photo_url} alt="" loading="lazy" />
                ) : (
                  <span className="cast-nophoto" aria-hidden="true">
                    {person.name.charAt(0)}
                  </span>
                )}
                <strong>{person.name}</strong>
                {person.character && <span className="muted">{person.character}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
