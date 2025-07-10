import { useState, useEffect } from "react";
import Login from "./Login";
import DashboardLayout from "./DashboardLayout";
import TerminListe from "./TerminListe";
import DashboardOverview from "./DashboardOverview";
import SettingsPage from "./SettingsPage";
import ServiceManagement from "./ServiceManagement";
import FriseurManagement from "./FriseurManagement";

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

  const handleLoginSuccess = (name) => {
    setIsLoggedIn(true);
    setUsername(name);
    localStorage.setItem("username", name);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUsername("");
    localStorage.removeItem("username");
    localStorage.removeItem("activePage");
  };

  const setActiveAndSave = (page) => {
    setActivePage(page);
    localStorage.setItem("activePage", page);
  };

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":
        return <DashboardOverview />;
      case "termine":
        return <TerminListe />;
      case "einstellungen":
        return <SettingsPage />;
      case "services":
        return <ServiceManagement />;
      case "friseur":
        return <FriseurManagement />;
      case "benutzer":
        return <div className="text-gray-500">👥 Benutzerverwaltung kommt bald...</div>;
      default:
        return null;
    }
  };

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <DashboardLayout username={username} onLogout={handleLogout} setActivePage={setActiveAndSave}>
      {renderPage()}
    </DashboardLayout>
  );
}
