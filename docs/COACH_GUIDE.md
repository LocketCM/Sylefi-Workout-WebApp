# Sylefi Wellness — Coach Guide

Welcome, Meg! This is your quick-start guide to the Sylefi Wellness app.

**App URL:** https://locketcm.github.io/Sylefi-Workout-WebApp/

Bookmark it on your phone and computer. On your phone, you can also "Add to Home Screen" from your browser menu so it opens like an app.

---

## Signing in

1. Go to the app URL above.
2. On the home screen, tap **Coach Portal**.
3. Enter your email and password (Cole gave these to you).
4. You'll land on your **Coach Dashboard**.

If you ever forget your password, message Cole — he can reset it for you from the back end.

> **Tip:** Your login stays active. You usually won't need to sign in again unless you sign out manually or clear your browser data.

---

## The Coach Dashboard

Your dashboard is the home base. From here you can see:

- **Active clients** — quick count
- **Stale programs** — anyone whose program hasn't been updated in 3+ weeks shows up here as a reminder to refresh them
- **Recent activity** — at-a-glance status

The sidebar (or hamburger menu on mobile) gets you everywhere else:

| Section | What it does |
|---|---|
| **Dashboard** | Overview |
| **Clients** | Add, edit, invite clients |
| **Programs** | Build and publish workout programs |
| **Exercises** | Your exercise library |
| **Messages** | Chat with clients |
| **View as Client** | Preview the app exactly as a client sees it |

---

## Adding and inviting a new client

1. Sidebar → **Clients** → **+ New Client**
2. Fill in their first name, last name, email, and phone (email/phone are optional but nice to have)
3. Save — the client is now in **Invited** status
4. On the client's row, tap the **Invite** button to generate a **6-character code** and a join link
5. Send the link or code to your client (text, email, however you normally reach them)

> The invite code expires in **7 days**. If they don't claim it in time, just generate a new one — it's harmless.

Once they join, the client's status flips from **Invited** to **Active** automatically.

### Personal sign-in link (for returning clients)

Once a client is **Active**, they get a **permanent personal sign-in link** that never expires. This is what they should use to get back into the app — the original invite code is single-use only.

To grab it:

1. Go to **Clients**
2. On any active client's row, tap the **🔑 key icon** (next to the history icon)
3. Tap **Copy Sign-In Link** and send it to them

Tell them to **bookmark it** or "Add to Home Screen" — that way they can always get back in, even if they get signed out, switch phones, or clear their browser.

> Treat the link like a password — anyone with it can sign in as that client. If a client ever loses their device, the safest move is to use the **Re-send invite code** button (refresh icon) to issue a new invite, which will replace the old account binding.

---

## Building a program

1. Sidebar → **Programs** → **+ New Program**
2. Pick which client it's for and give it a title (e.g., "Week of April 7")
3. Add workouts — each workout has a title and a list of exercises
4. For each exercise: pick from your library (or add a new one), then set sets, reps, and weight
5. You can add a **coach note** to any workout (e.g., "focus on form, not weight this week")
6. Save as **Draft** while you're still working on it
7. When it's ready, hit **Publish** — the client sees it instantly

### Editing a published program

You can edit a program **after** it's published — the client sees changes in real time. When you save changes to an already-published program, the "last updated" timestamp refreshes so it doesn't show up as stale.

### Safety gate

If you try to publish a second program for a client who already has an active one, the app will warn you. Two active programs at once is confusing for the client — usually you want to **unpublish the old one first**, then publish the new one.

---

## Messaging clients

Sidebar → **Messages**

- Left side: list of clients (sorted by most recent message)
- Right side: the conversation thread
- Unread messages show a teal badge in the sidebar **and** in the browser tab title (e.g., "(2) Sylefi…") so you'll notice even if the app isn't in focus

Hit Enter to send. New messages from clients appear in real time — no refresh needed.

---

## "View as Client" — previewing what your client sees

This is the easiest way to double-check a program before clients see it.

1. Sidebar → **View as Client**
2. Pick a client from the list
3. You'll see their dashboard exactly as they do — workouts, completion status, the whole thing
4. An **amber banner** at the top reminds you it's preview mode (buttons are inert — you can't accidentally start a workout or send a message as them)
5. Quick shortcuts at the bottom let you jump to **Edit this program**, **View workout history**, or **Open thread**

---

## Workout history

From a client's row in **Clients**, tap the **history icon** to see every workout they've logged — actual sets, reps, weights, and any notes they left for you. Click any workout to expand it.

---

## Stale program reminders

If a client's program hasn't been updated in **3 weeks**, they'll appear in the "Time for a refresh" card on your dashboard. This is just a nudge — nothing breaks if you ignore it.

---

## Signing out

Top-right of the sidebar → **Sign Out**. Only do this if you're on a shared computer; otherwise, just close the tab.

---

## Common questions

**Q: Can my client see other clients?**
No. The database itself enforces that each client only ever sees their own data. Even if someone tried to poke at the API directly, they couldn't see anyone else.

**Q: What if I publish the wrong program?**
Open it, hit **Unpublish**, fix it, and republish. The client's view updates instantly.

**Q: A client says they can't sign in.**
Make sure they're using the **join link with the code**, not the coach login. If their code expired, send a fresh one from the Clients page.

**Q: I want to suggest a new feature.**
Text Cole — he's tracking ideas and will add them in.

---

If anything ever looks wrong or broken, screenshot it and send it to Cole. The app updates often, and feedback is the fastest way to get fixes in.
