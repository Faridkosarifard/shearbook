import { useEffect, useState } from "react";
import Login from "./Login";
import DashboardLayout from "./DashboardLayout";
import TerminListe from "./TerminListe";
import DashboardOverview from "./DashboardOverview";
import SettingsPage from "./SettingsPage";
import ServiceManagement from "./ServiceManagement";
import FriseurManagement from "./FriseurManagement";
import BlacklistManagement from "./BlacklistManagement";

type PageId =
  | "dashboard"
  | "termine"
  | "einstellungen"
  | "services"
  | "friseur"
  | "blacklist"
  | "benutzer";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activePage, setActivePage] = useState<PageId>(
    (localStorage.getItem("activePage") as PageId) || "dashboard"
  );

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) setIsLoggedIn(true);
  }, []);

  if (!isLoggedIn) {
    return (
      <Login
        onLoginSuccess={() => {
          setIsLoggedIn(true);
        }}
      />
    );
  }

  return (
    <DashboardLayout
      username={localStorage.getItem("username") ?? ""}
      onLogout={() => {
        // هر چیزی برای لاگ‌اوت لازم داری
        localStorage.removeItem("token");
        setIsLoggedIn(false);
      }}
      setActivePage={(p: PageId) => {
        setActivePage(p);
        localStorage.setItem("activePage", p);
      }}
    >
      {activePage === "dashboard" && <DashboardOverview />}
      {activePage === "termine" && <TerminListe />}
      {activePage === "einstellungen" && <SettingsPage />}
      {activePage === "services" && <ServiceManagement />}
      {activePage === "friseur" && <FriseurManagement />}
      {activePage === "blacklist" && <BlacklistManagement />}
    </DashboardLayout>
  );
}

export default App;
