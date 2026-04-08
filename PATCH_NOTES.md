# Sylefi Wellness — Patch Notes

Running log of changes shipped to production. Newest at the top.

Format: each entry is a date heading with bullet points grouped by **Coach**, **Client**, or **Under the hood**. Keep entries short and user-facing — this is meant to be readable by Meg, not a git log.

---

## 2026-04-08

**Client**
- Sets and Reps are now **required** before you can mark an exercise complete. The boxes flash red until you fill them in.
- Weight is now a free-text field — type `BW`, `Bodyweight`, `95`, or whatever fits. Numbers still display with units; text shows as-is.
- Workout history reflects the same formatting so bodyweight movements look right.
- **New Settings page** at the gear icon: pick **lbs vs kg** for how weights are labeled (no conversion — purely a display preference) and toggle dark/light mode.

**Coach**
- **New Settings page** in the sidebar. First setting: a global **welcome message** that shows on every client's dashboard. Supports `{first_name}` so you can write things like *"Welcome back, {first_name} 💪"* and each client sees their own name. Includes a live preview.
- **Edit clients in place.** Each client row in the Clients page now has a ✏ pencil icon. Tap it to update their name, display name, email, phone, and a new **Notes** field for coach-only contact info, scheduling preferences, goals, emergency contacts — anything you want to remember. Phone now also shows on the client card under their email.
- **Clear conversation.** Each message thread in the Messages page now has a 🗑 button in the top-right. Tap it to wipe the entire chat history with that client (with a confirmation — there's no undo). Useful for resetting after a long-running thread without affecting any other client.
- Meg now has a display name in Supabase ("Meg") so she's easy to spot in the user list.

**Under the hood**
- Added `clients.weight_unit` column (default `lbs`, check constraint allows `lbs`/`kg`) and a generic `app_settings` key/value table for future global settings, with RLS allowing reads to any signed-in user but writes only to the coach.
- Added `clients.notes` column for the coach-only notes field.
- Extracted weight formatting into a shared `src/lib/formatters.js` helper so WorkoutSession and WorkoutHistory can both apply the client's preferred unit.
- Fixed pre-fill bug on the Join page where new clients' email/phone weren't pulled from the invite row.
- Cleaned up a redundant default in the New Program mode picker.

---

## 2026-04-07

**Coach**
- **Program templates and unassigned drafts.** Programs can now be built three ways: assigned to a client, unassigned (assign later in place), or saved as a reusable template (cloned each time it's used). Templates live forever until you delete them.
- **Activity feed.** New "Activity" tab in the sidebar shows recently completed workouts grouped by Today / Yesterday / N days ago, with a badge for unseen completions. Opening the page clears the badge.
- **Customizable client sign-in codes.** From the Clients page, tap the 🔑 key icon to see (and now edit) a client's permanent sign-in code. Pick something memorable like `MEGSCLIENT` or randomize it.
- **Multi-select exercise picker.** Adding exercises to a workout now lets you tap several at once and add them in a single batch instead of clicking Add Exercise repeatedly.
- **Coach completion notifications.** Workout completions stay marked unseen until you view the Activity page.

**Client**
- **Persistent personal sign-in code.** Each active client now has a permanent 12-character code that lets them sign back in from any device — no new invite needed. Share the link via the 🔑 icon on the Clients page.
- **New landing flow.** Tapping "Join with Code" on the home page now offers two clear paths: **New Client?** (first-time invite) and **Returning Client** (personal sign-in code).
- The `/join` page now auto-routes long codes to the right place if they get pasted in the wrong box.

**Under the hood**
- Fixed an "ambiguous id" error in the `client_signin` Postgres function (renamed OUT params, qualified the update).
- Fixed PWA home-screen icon — the manifest referenced missing `icon-192.png` / `icon-512.png` files. Generated proper PNGs from the logo with padding so iOS doesn't crop the rose. Added `apple-touch-icon.png` and the iOS web-app meta tags so the shortcut launches in standalone mode with the right name.
- Added `OWNER_TROUBLESHOOTING.md` and `docs/COACH_GUIDE.md` / `docs/CLIENT_GUIDE.md` for on-the-fly fixes and onboarding reference.

---

<!--
Template for future entries:

## YYYY-MM-DD

**Coach**
- ...

**Client**
- ...

**Under the hood**
- ...
-->
