# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Running the Project

No build step, no package manager, no test runner. Dependencies load from CDNs (`@supabase/supabase-js@2`, Tabler Icons, Google Fonts) at runtime.

- **Development**: serve the directory with any static server (the service worker requires HTTP, not `file://`):
  ```
  npx serve .
  ```
- **No build, lint, or test commands exist.**

## Architecture

Same architecture as EduTrack (F:\ManagementStudent) — this project was bootstrapped from its conventions and reuses its `style.css` as a base (EduBranch additions are appended at the bottom of the file).

| File | Role |
|------|------|
| `index.html` | Shell: sidebar nav, topbar, `#pageContent`, modal, toast, bottom nav + "more" drawer (mobile). Loads supabase-js (CDN) → `data.js` → `app.js`, registers `sw.js`. |
| `data.js` | Supabase client (`_sb`), `DB` in-memory cache, `initDB()`, `db*` dual-write mutators, synchronous read helpers, salary calculator. `SUPABASE_URL`/`SUPABASE_KEY` at the top must be filled in. |
| `app.js` | Router (`renderPage`), page renderers returning HTML strings, inline `onclick` handlers (global functions), auth flows. |
| `style.css` | EduTrack base + EduBranch-specific additions at the bottom. Design tokens on `:root`; mobile breakpoint 768px. |
| `supabase_schema.sql` | Authoritative schema. Run once in Supabase SQL Editor. Commented ROLLBACK block at the bottom. |
| `supabase/functions/create-teacher/` | Edge Function: create/delete teacher auth accounts + reset password (needs service role). Deploy with `supabase functions deploy create-teacher`. |
| `sw.js` | Cache-first service worker, `CACHE_NAME = 'edubranch-v1'` — **bump on every shell change**. |

### Roles & data flow

Two roles in `profiles.role`: `admin` and `teacher`. Role and `branch_id` live in auth **app_metadata** (only service role can set them); the `handle_new_user` trigger copies them into `profiles` on signup. Self-registration on the app always creates an `admin`; teachers are created only via the `create-teacher` Edge Function.

`DB` is a synchronous cache of `profiles`, `branches`, `subjects`, `teacher_salaries`, `schedules`, populated by `initDB()` before the first render. RLS shapes what each role receives from the same `select('*')` calls (admin: own branches' data; teacher: own rows only). Every mutator dual-writes: Supabase first, then mutate `DB` on success.

### Schedule status model

`schedules.status`: `scheduled → in_progress → completed`, updated by teachers **only through RPCs** `check_in_schedule` (requires own schedule, today, scheduled) and `complete_schedule` (requires in_progress). There is no teacher UPDATE policy on the table. A past-date schedule not `completed` is displayed as "Không dạy" (`displayStatus()` in data.js) — derived, never stored.

### Salary model

`teacher_salaries` is an append-only history keyed by `effective_from`; `getSalaryAsOf(teacherId, month, year)` picks the latest record effective by month-end. `salary_type`: `fixed` | `per_session` | `mixed`. Monthly pay = base (fixed/mixed) + per_session_amount × completed sessions (per_session/mixed) — implemented in both `calcTeacherSalary` (data.js) and `calc_teacher_salary` (SQL, permission-guarded); keep them in sync.

### UI conventions

- All UI text in Vietnamese. Toasts: `showToast(msg, 'success'|'error')`. Modals: `openModal(title, bodyHTML)` / `openConfirm(title, html, cb)` / `closeModal()`.
- Icons: Tabler via CDN (`<i class="ti ti-...">`).
- Admin-only nav items carry `.nav-admin`, hidden via `body.role-teacher`. Admin-only pages listed in `ADMIN_ONLY_PAGES` in app.js.
- `escapeHtml()` on every user string interpolated into HTML — the app relies on inline onclick handlers, so this is the primary XSS defense.
