import { Link } from "../router";
import { CollectionTab } from "./CollectionTab";
import { ProfileTab } from "./ProfileTab";

type Tab = "collection" | "profile";

const TABS: { id: Tab; label: string; to: string }[] = [
  { id: "collection", label: "My collection", to: "/dashboard/collection" },
  { id: "profile", label: "Profile", to: "/dashboard/profile" },
];

export function DashboardPage({ tab }: { tab: Tab }) {
  return (
    <main className="dashboard">
      {/* The tabs are links, so each has its own address and survives a refresh. */}
      <nav className="tabs" aria-label="Dashboard">
        {TABS.map((t) => (
          <Link
            key={t.id}
            to={t.to}
            className="tab"
            aria-current={t.id === tab ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "collection" ? <CollectionTab /> : <ProfileTab />}

      <footer className="footnote">
        Film and TV details and covers come from TMDB. This product uses the TMDB API but is not
        endorsed or certified by TMDB.
      </footer>
    </main>
  );
}
