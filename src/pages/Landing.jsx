import { Link } from 'react-router-dom';
import { Dumbbell, Users, Moon, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';
import logoUrl from '/sylefi-logo.webp';

export default function Landing() {
  const [dark, setDark] = useState(
    () => localStorage.getItem('sw-theme') === 'dark'
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('sw-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt="Sylefi Wellness"
            className="w-12 h-12 rounded-full object-cover shadow-sm"
          />
          <p className="hidden sm:block text-xs text-muted-foreground font-medium tracking-widest uppercase">
            Training App
          </p>
        </Link>
        <button
          onClick={() => setDark(!dark)}
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
          aria-label="Toggle theme"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-xl animate-fade-in">
          <img
            src={logoUrl}
            alt="Sylefi Wellness"
            className="w-32 h-32 md:w-40 md:h-40 mx-auto mb-6 rounded-full object-cover shadow-lg"
          />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-accent" />
            Private Training Portal
          </div>
          <h1 className="text-4xl md:text-5xl font-playfair font-semibold mb-4">
            Welcome to <span className="text-primary">Sylefi</span>{' '}
            <span className="text-accent">Wellness</span>
          </h1>
          <p className="text-muted-foreground mb-8">
            Your programs, your progress, your coach — all in one place.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <Link
              to="/login"
              className="group rounded-xl bg-card border border-border p-6 text-left hover:border-primary hover:shadow-md transition-all"
            >
              <Users className="w-6 h-6 text-primary mb-3" />
              <p className="font-playfair font-semibold mb-1">Coach Portal</p>
              <p className="text-sm text-muted-foreground">
                Manage clients, build programs, view progress.
              </p>
            </Link>
            <Link
              to="/join"
              className="group rounded-xl bg-card border border-border p-6 text-left hover:border-accent hover:shadow-md transition-all"
            >
              <Dumbbell className="w-6 h-6 text-accent mb-3" />
              <p className="font-playfair font-semibold mb-1">Join with Code</p>
              <p className="text-sm text-muted-foreground">
                Got an invite from your coach? Enter your code here.
              </p>
            </Link>
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-muted-foreground py-6">
        Sylefi Wellness · Private Training
      </footer>
    </div>
  );
}
