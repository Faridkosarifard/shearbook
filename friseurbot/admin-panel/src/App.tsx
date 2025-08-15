import { useState, useEffect } from "react";
import Login from "./Login";
import DashboardLayout from "./DashboardLayout";
import TerminListe from "./TerminListe";
import DashboardOverview from "./DashboardOverview";
import SettingsPage from "./SettingsPage";
import ServiceManagement from "./ServiceManagement";
import FriseurManagement from "./FriseurManagement";
import BlacklistManagement from "./BlacklistManagement";
import api from "./api";

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [activePage, setActivePage] = useState("dashboard");

  useEffect(() => {
    const savedUser = localStorage.getItem("username");
    if (savedUser) {
      setIsLoggedIn(true);
      setUsername(savedUser);
    }

    const savedPage = localStorage.getItem("activePage");
    if (savedPage) {
      setActivePage(savedPage);
    }
  }, []);

  const handleLoginSuccess = (name: string) => {
    setIsLoggedIn(true);
    setUsername(name);
    localStorage.setItem("username", name);
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout"); // ⬅️ NEW
    } catch (e) {
      // ignore errors; we'll clear client state anyway
    }
    setIsLoggedIn(false);
    setUsername("");
    localStorage.removeItem("username");
  };

  const renderContent = () => {
    switch (activePage) {
      case "dashboard":    return <DashboardOverview />;
      case "termine":      return <TerminListe />;
      case "einstellungen":return <SettingsPage />;
      case "services":     return <ServiceManagement />;
      case "friseur":      return <FriseurManagement />;
      case "blacklist":    return <BlacklistManagement />;
      case "benutzer":     return <div className="text-gray-500">👥 Benutzerverwaltung kommt bald...</div>;
      default:             return null;
    }
  };

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <DashboardLayout
      username={username}
      onLogout={handleLogout}       // ⬅️ ensure DashboardLayout calls this
      setActivePage={(p) => { setActivePage(p); localStorage.setItem("activePage", p); }}
    >
      {renderContent()}
    </DashboardLayout>
  );
}
