// src/App.tsx
import { useEffect, useState } from "react";
import api from "./api";
import Login from "./Login";
import DashboardLayout from "./DashboardLayout";
import TerminListe from "./TerminListe";
import DashboardOverview from "./DashboardOverview";
import SettingsPage from "./SettingsPage";
import ServiceManagement from "./ServiceManagement";
import FriseurManagement from "./FriseurManagement";
import BlacklistManagement from "./BlacklistManagement";
import FriseurSchedulePage from "./FriseurSchedule";
import WhatsAppAdminPage from "./WhatsAppAdmin";

type PageId =
  | "dashboard"
  | "termine"
  | "einstellungen"
  | "services"
  | "friseur"
  | "blacklist"
  | "benutzer"
  | "arbeitszeiten"
  | "whatsapp";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string>(localStorage.getItem("username") ?? "");
  const [activePage, setActivePage] = useState<PageId>(
    (localStorage.getItem("activePage") as PageId) || "dashboard",
  );

  // On refresh, verify admin cookie + refresh CSRF
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/auth/csrf"); // requires valid admin cookie
        setIsLoggedIn(r.data?.status === "ok");
      } catch {
        setIsLoggedIn(false);
      }
    })();
  }, []);

  if (isLoggedIn === null) {
    return <div className="p-6 text-gray-600">Lade…</div>;
  }

  if (!isLoggedIn) {
    return (
      <Login
        onLoginSuccess={(u: string) => {
          setUsername(u);
          localStorage.setItem("username", u);
          setIsLoggedIn(true);
        }}
      />
    );
  }

  return (
    <DashboardLayout
      username={username}
      onLogout={async () => {
        try {
          await api.post("/auth/logout");
        } catch {}
        localStorage.removeItem("username");
        setUsername("");
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
      {activePage === "arbeitszeiten" && <FriseurSchedulePage />}
      {activePage === "blacklist" && <BlacklistManagement />}
      {activePage === "whatsapp" && <WhatsAppAdminPage />}
    </DashboardLayout>
  );
}

export default App;
