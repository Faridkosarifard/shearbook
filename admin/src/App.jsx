import { useEffect, useState } from "react";
import api from "./api";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage";
import Stylists from "./pages/Stylists";
import Schedule from "./pages/Schedule";
import Services from "./pages/Services";
import Assignments from "./pages/Assignments";
import Blacklist from "./pages/Blacklist";
import SettingsPage from "./pages/Settings";
import WhatsApp from "./pages/WhatsApp";

const PAGES = {
  dashboard: Dashboard,
  calendar: CalendarPage,
  stylists: Stylists,
  schedule: Schedule,
  services: Services,
  assignments: Assignments,
  blacklist: Blacklist,
  settings: SettingsPage,
  whatsapp: WhatsApp,
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [page, setPage] = useState(localStorage.getItem("shearbook.page") || "dashboard");

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/auth/csrf");
        if (res.data?.status === "ok") {
          setUsername(localStorage.getItem("shearbook.user") || "admin");
          setReady("in");
          return;
        }
      } catch {
        /* not signed in */
      }
      setReady("out");
    })();
  }, []);

  if (ready === false) {
    return <div className="p-8 text-ink/60">Loading…</div>;
  }
  if (ready === "out") {
    return (
      <Login
        onSuccess={(name) => {
          localStorage.setItem("shearbook.user", name);
          setUsername(name);
          setReady("in");
        }}
      />
    );
  }

  const View = PAGES[page] || Dashboard;
  return (
    <Layout
      username={username}
      active={page}
      onNavigate={(id) => {
        setPage(id);
        localStorage.setItem("shearbook.page", id);
      }}
      onLogout={async () => {
        try {
          await api.post("/auth/logout");
        } catch {
          /* ignore */
        }
        localStorage.removeItem("shearbook.user");
        setReady("out");
      }}
    >
      <View />
    </Layout>
  );
}
