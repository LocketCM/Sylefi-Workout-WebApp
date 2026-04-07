# Sylefi Wellness App

Private training app for Sylefi Wellness. Coach manages clients and programs; clients log workouts and chat with their coach.

- **Stack:** React + Vite + Tailwind + Supabase, deployed to GitHub Pages as a PWA
- **Scale:** 1–10 clients
- **Auth:** Coach = email login; clients = 6-char invite code only

---

## First-time setup (do these once)

Your machine already has Node.js 24, npm 11, and git installed — you're good to go.

### 1. Install dependencies

Open a terminal in this folder (`Sylefi-Wellness-App`) and run:

```bash
npm install
```

This downloads everything the app needs into a `node_modules` folder. Takes ~30 seconds.

### 2. Start the dev server

```bash
npm run dev
```

You'll see a line like `Local: http://localhost:5173/Sylefi-Wellness-App/`. Open that URL in your browser. You should see the Sylefi landing page with teal/gold branding and a dark-mode toggle in the top-right.

Press `Ctrl+C` in the terminal to stop the server when you're done.

### 3. (Later) Create a Supabase project

When we're ready to wire up real data:

1. Go to https://supabase.com/ → sign in with GitHub → "New Project"
2. Name it `sylefi-wellness`, pick a region close to you, set a strong database password (save it somewhere safe)
3. Wait ~1 minute for provisioning
4. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key
5. In this folder, copy `.env.local.example` to `.env.local` and paste the values in
6. Restart `npm run dev`

I'll walk you through this step-by-step when we get there.

### 4. (Later) Deploy to GitHub Pages

When we're ready to ship:

1. Create a new **public** GitHub repo named exactly `Sylefi-Wellness-App` (the name matters — it's in `vite.config.js`)
2. In this folder, run these commands (I'll walk you through each one):
   ```bash
   git init
   git add .
   git commit -m "Initial scaffold"
   git branch -M main
   git remote add origin https://github.com/<your-username>/Sylefi-Wellness-App.git
   git push -u origin main
   ```
3. Run `npm run deploy` — this builds the site and publishes it to a `gh-pages` branch
4. In GitHub → repo → **Settings → Pages** → set source to **gh-pages** branch → save
5. Your app will be live at `https://<your-username>.github.io/Sylefi-Wellness-App/`

---

## Project structure

```
Sylefi-Wellness-App/
├── public/
│   ├── favicon.svg            — Teal S-in-circle icon
│   └── manifest.webmanifest   — PWA manifest (installable to home screen)
├── src/
│   ├── lib/
│   │   ├── supabase.js        — Supabase client singleton
│   │   └── utils.js           — cn() class-merge helper
│   ├── pages/
│   │   ├── Landing.jsx        — Home page (role picker)
│   │   ├── JoinPage.jsx       — Client invite-code entry (placeholder)
│   │   ├── CoachDashboard.jsx — Coach home (placeholder)
│   │   └── ClientDashboard.jsx — Client home (placeholder)
│   ├── App.jsx                — Router
│   ├── main.jsx               — Entry point
│   └── index.css              — Tailwind + Sylefi design tokens
├── index.html                 — HTML shell with PWA meta tags
├── vite.config.js             — base='/Sylefi-Wellness-App/' for GitHub Pages
├── tailwind.config.js         — Teal/gold color palette + animations
├── postcss.config.js
├── jsconfig.json              — Enables @/ path alias
├── .env.local.example         — Copy to .env.local and fill in
└── .gitignore
```

## Design tokens

Ported verbatim from the Base44 reference code:

- **Primary (teal):** `hsl(175 52% 32%)` light / `hsl(175 52% 42%)` dark
- **Accent (gold):** `hsl(42 60% 52%)`
- **Fonts:** Inter (body) + Playfair Display (headings)
- **Dark mode:** toggled via `.dark` class on `<html>`, persisted in `localStorage['sw-theme']`

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (run once after cloning or when `package.json` changes) |
| `npm run dev` | Start local dev server with hot reload |
| `npm run build` | Build the production bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run deploy` | Build + publish to GitHub Pages (after repo is set up) |

## What's NOT in this app (and why)

- **No user-facing AI** — Cole's explicit requirement; AI is only for building the app, not a feature
- **No payments / Stripe** — private trainer app, no billing
- **No public signup** — only Meg can invite clients
- **No tracking / analytics** — keeps data minimal; only contact info + workouts are stored
```
