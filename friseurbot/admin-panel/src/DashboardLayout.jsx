import { useState, useEffect } from "react";
import { Sun, Moon, Menu, X } from "lucide-react";

export default function DashboardLayout({ username, onLogout, setActivePage, children }) {
  const [isDark, setIsDark] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
    setIsDark(!isDark);
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard" },
    { id: "termine", label: "Termine" },
    { id: "einstellungen", label: "Einstellungen" },
    { id: "services", label: "Services" },
    { id: "friseur", label: "Friseur" },
    { id: "arbeitszeiten", label: "Arbeitszeiten" },
    { id: "blacklist", label: "Blacklist" },
    { id: "benutzer", label: "Benutzer" },
    { id: "whatsapp", label: "Whatsapp Einstellung"},
  ];

  const active = localStorage.getItem("activePage");

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white dark:bg-gray-800 shadow-lg p-4">
        <div className="text-xl font-bold text-blue-700 dark:text-blue-300 mb-6">
          💈 Your Salon
        </div>
        <nav className="space-y-2">
          {navItems.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActivePage(id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm font-medium transition ${
                active === id
                  ? "bg-blue-100 dark:bg-blue-700 text-blue-700 dark:text-white"
                  : "text-gray-700 dark:text-gray-200"
              } hover:bg-blue-50 dark:hover:bg-blue-600`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="border-t pt-4 mt-6 text-sm">
          <p className="mb-2">👤 {username}</p>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-red-600 hover:underline"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white dark:bg-gray-800 shadow-lg z-40 transform ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } transition-transform duration-300 ease-in-out md:hidden`}
      >
        <div className="p-4 space-y-6">
          <div className="flex justify-between items-center text-xl font-bold text-blue-700 dark:text-blue-300">
            💈 Your Salon
            <button onClick={() => setIsSidebarOpen(false)}>
              <X className="w-6 h-6" />
            </button>
          </div>
          <nav className="space-y-2">
            {navItems.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => {
                  setActivePage(id);
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm font-medium transition ${
                  active === id
                    ? "bg-blue-100 dark:bg-blue-700 text-blue-700 dark:text-white"
                    : "text-gray-700 dark:text-gray-200"
                } hover:bg-blue-50 dark:hover:bg-blue-600`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="border-t pt-4 mt-6 text-sm">
            <p className="mb-2">👤 {username}</p>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 text-red-600 hover:underline"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col w-full">
        <div className="flex justify-between items-center mb-4 p-4 md:hidden">
          <button onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="text-sm">{isDark ? "Light Mode" : "Dark Mode"}</span>
          </button>
        </div>

        <main className="flex-1 p-6 w-full">{children}</main>
      </div>
    </div>
  );
}
