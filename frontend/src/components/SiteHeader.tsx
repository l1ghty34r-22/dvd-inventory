import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { AccountMenu } from "./AccountMenu";
import { AppIcon } from "./AppIcon";

export function SiteHeader({ path }: { path: string }) {
  const { user, loading, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <AppIcon />
        NeverDisc
      </Link>

      {!loading && (
        <nav className="site-header-actions" aria-label="Account">
          {user ? (
            <AccountMenu
              user={user}
              showDashboardLink={!path.startsWith("/dashboard")}
              onLogout={handleLogout}
            />
          ) : (
            path !== "/login" && (
              <Link to="/login" className="button primary">
                Log in
              </Link>
            )
          )}
        </nav>
      )}
    </header>
  );
}
