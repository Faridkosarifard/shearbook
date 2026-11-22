import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Scissors,
  Settings,
  ShieldBan,
  Users,
  Link2,
} from "lucide-react";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "stylists", label: "Stylists", icon: Users },
  { id: "schedule", label: "Schedules", icon: ClipboardList },
  { id: "services", label: "Services", icon: Scissors },
  { id: "assignments", label: "Assignments", icon: Link2 },
  { id: "blacklist", label: "Block list", icon: ShieldBan },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Layout({ username, active, onNavigate, onLogout, children }) {
  return (
    <div className="h-screen flex bg-cream overflow-hidden">
      <aside className="w-64 shrink-0 bg-ink text-cream flex flex-col">
        <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
          <img src="/logo.svg" alt="" className="h-10 w-10 rounded-xl bg-white/5" />
          <div>
            <div className="font-semibold tracking-tight">ShearBook</div>
            <div className="text-xs text-cream/60">{username}</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const current = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition ${
                  current ? "bg-copper text-white" : "hover:bg-white/10"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <button
          onClick={onLogout}
          className="m-3 flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/10"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </aside>
      <main className="flex-1 min-h-0 p-8 overflow-auto flex flex-col">{children}</main>
    </div>
  );
}
