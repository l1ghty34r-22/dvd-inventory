import { useAuth } from "./auth";
import { SiteHeader } from "./components/SiteHeader";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { Redirect, usePath } from "./router";

const TABS = { "/dashboard/collection": "collection", "/dashboard/profile": "profile" } as const;

function Page({ path }: { path: string }) {
  const { user } = useAuth();

  if (path === "/") return <HomePage />;
  if (path === "/login") return user ? <Redirect to="/dashboard/collection" /> : <LoginPage />;
  if (path.startsWith("/dashboard")) {
    if (!user) return <Redirect to="/login" />;
    const tab = TABS[path as keyof typeof TABS];
    return tab ? <DashboardPage tab={tab} /> : <Redirect to="/dashboard/collection" />;
  }
  return <Redirect to="/" />;
}

export function App() {
  const { loading } = useAuth();
  const path = usePath();

  return (
    <div className="site">
      <SiteHeader path={path} />
      {loading ? <p className="muted center">Loading…</p> : <Page path={path} />}
    </div>
  );
}
