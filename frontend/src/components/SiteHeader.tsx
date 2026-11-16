import { useAuth } from "../auth";
import { Link, navigate } from "../router";

export function SiteHeader({ path }: { path: string }) {
  const { user, loading, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <span className="brand-disc" aria-hidden="true" />
        DVD Inventory
      </Link>

      {!loading && (
        <nav className="site-header-actions" aria-label="Account">
          {user ? (
            <>
              {!path.startsWith("/dashboard") && (
                <Link to="/dashboard/collection" className="button secondary">
                  Dashboard
                </Link>
              )}
              <span className="muted header-email">{user.email}</span>
              <button type="button" className="button secondary" onClick={handleLogout}>
                Log out
              </button>
            </>
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
