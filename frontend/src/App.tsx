import { useAuth } from "./auth";
import { InventoryPage } from "./pages/InventoryPage";
import { LoginPage } from "./pages/LoginPage";

export function App() {
  const { user, loading } = useAuth();

  if (loading) return <p className="muted center">Loading…</p>;
  return user ? <InventoryPage /> : <LoginPage />;
}
