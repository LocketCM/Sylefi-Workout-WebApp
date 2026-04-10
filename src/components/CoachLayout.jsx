import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Dumbbell, BookOpen, ClipboardList, MessageSquare, Eye, Activity,
  LogOut, Sun, Moon, Menu, X, ChevronRight, Settings,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useCoachUnreadMessages, useCoachUnreadCompletions } from '@/lib/useUnreadMessages';
import logoUrl from '/sylefi-logo.webp';

// Persistent shell for all coach pages: sidebar + mobile menu + theme toggle.
// Mirrors the Base44 reference layout — same nav structure, same dark/light pattern.
export default function CoachLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('sw-theme') === 'dark');
  const [menuOpen, setMenuOpen] = useState(false);
  const unreadMessages    = useCoachUnreadMessages();
  const unreadCompletions = useCoachUnreadCompletions();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('sw-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const nav = [
    { to: '/coach',           icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/coach/clients',   icon: Users,           label: 'Clients' },
    { to: '/coach/in-person', icon: Dumbbell,        label: 'In-Person' },
    { to: '/coach/programs',  icon: ClipboardList,   label: 'Programs' },
    { to: '/coach/exercises', icon: BookOpen,        label: 'Exercise Library' },
    { to: '/coach/activity',  icon: Activity,        label: 'Activity', badge: unreadCompletions },
    { to: '/coach/messages',  icon: MessageSquare,   label: 'Messages', badge: unreadMessages },
    { to: '/coach/view-as',   icon: Eye,             label: 'View as Client' },
    { to: '/coach/settings',  icon: Settings,        label: 'Settings' },
  ];

  // Match exact for /coach, prefix for everything else.
  const isActive = (to) => to === '/coach'
    ? location.pathname === '/coach'
    : location.pathname.startsWith(to);

  return (
    <div className="min-h-screen bg-background font-inter flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar text-sidebar-foreground min-h-screen fixed left-0 top-0 z-30">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Sylefi" className="w-10 h-10 rounded-full object-cover" />
            <div>
              <p className="font-playfair font-semibold text-sm leading-tight">Sylefi Wellness</p>
              <p className="text-xs text-sidebar-foreground/60">Coach Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {nav.map(({ to, icon: Icon, label, badge }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive(to)
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                  {badge}
                </span>
              )}
              {isActive(to) && !badge && <ChevronRight size={14} />}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-2">
          <button
            onClick={() => setDark(!dark)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground w-full transition-all"
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
            {dark ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground w-full transition-all"
          >
            <LogOut size={18} />
            Sign Out
          </button>
          <div className="px-3 pt-1">
            <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email}</p>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="Sylefi" className="w-8 h-8 rounded-full object-cover" />
          <span className="font-playfair font-semibold text-sm">Sylefi Wellness</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDark(!dark)} className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => setMenuOpen(!menuOpen)} className="relative p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
            {(unreadMessages > 0 || unreadCompletions > 0) && !menuOpen && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setMenuOpen(false)}>
          <div className="w-64 h-full bg-sidebar p-4 pt-16 space-y-1" onClick={(e) => e.stopPropagation()}>
            {nav.map(({ to, icon: Icon, label, badge }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive(to)
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent'
                }`}
              >
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </Link>
            ))}
            <button
              onClick={signOut}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent w-full"
            >
              <LogOut size={18} />Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
