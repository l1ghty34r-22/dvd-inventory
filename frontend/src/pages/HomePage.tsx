import { useAuth } from "../auth";
import { Link } from "../router";

const FEATURES = [
  {
    title: "Search films and TV",
    text: "Type a title and pick it from the results. Cover, year, genres and runtime fill in for you.",
  },
  {
    title: "Scan the barcode",
    text: "Point your phone at the back of the case. The app works out which disc it is.",
  },
  {
    title: "See your collection",
    text: "Your discs on a shelf, with the cast and story a click away, and stats on what you own.",
  },
];

export function HomePage() {
  const { user } = useAuth();

  return (
    <main className="home">
      <section className="hero">
        <p className="eyebrow">Your DVD and TV box sets, catalogued</p>
        <h1>Every disc you own, on one shelf.</h1>
        <p className="lede">
          NeverDisc keeps track of the films and TV shows you own on disc. Add them by searching
          or scanning the barcode, find any of them in seconds, and see what your collection says
          about your taste.
        </p>
        <div className="hero-actions">
          {user ? (
            <Link to="/dashboard/collection" className="button primary large">
              Go to my collection
            </Link>
          ) : (
            <>
              <Link to="/signup" className="button primary large">
                Create a free account
              </Link>
              <Link to="/login" className="button secondary large">
                Log in
              </Link>
            </>
          )}
        </div>
      </section>

      <ul className="features">
        {FEATURES.map((feature) => (
          <li key={feature.title}>
            <h2>{feature.title}</h2>
            <p className="muted">{feature.text}</p>
          </li>
        ))}
      </ul>

      <footer className="footnote">
        Film and TV details and covers come from TMDB. This product uses the TMDB API but is not
        endorsed or certified by TMDB.
      </footer>
    </main>
  );
}
