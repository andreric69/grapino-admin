-- Erweiterung der Admin-App: Ankuendigungen, Feedback-Antworten, Kosten-
-- Platzhalter - plus ein genereller Fix, damit service_role (die Admin-App)
-- dauerhaft auf alle Tabellen zugreifen kann. Ohne den zweiten Teil wuerde
-- sich das "permission denied"-Problem von eben bei jeder neuen Tabelle
-- wiederholen.
--
-- Im Supabase Dashboard -> SQL Editor der HAUPT-Weinapp-Datenbank ausfuehren
-- (dieselbe Datenbank, die auch die wines-Tabelle enthaelt).

-- --- 1) service_role: dauerhafter Zugriff auf alle (auch kuenftige) Tabellen
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- --- 2) Ankuendigungen (Admin schreibt, alle Nutzer sehen sie in der App) ---
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  body text not null,
  is_active boolean not null default true
);

alter table public.announcements enable row level security;

create policy "aktive Ankuendigungen lesen"
  on public.announcements
  for select
  to authenticated
  using (is_active = true);

grant select on public.announcements to authenticated;

-- --- 3) Antworten auf App-Feedback (Admin antwortet, Nutzer sieht die Antwort)
create table public.feedback_replies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.app_feedback(id) on delete cascade,
  created_at timestamptz not null default now(),
  reply text not null
);

-- Maximal eine Antwort pro Feedback (MVP - reicht fuer den Anwendungsfall).
create unique index feedback_replies_feedback_id_idx on public.feedback_replies (feedback_id);

alter table public.feedback_replies enable row level security;

-- Nur die eigene Antwort lesen - schreiben kann ausschliesslich die Admin-App
-- (service_role, umgeht RLS ohnehin; keine insert/update-Policy fuer Nutzer).
create policy "eigene Antwort sehen"
  on public.feedback_replies
  for select
  to authenticated
  using (exists (
    select 1 from public.app_feedback f
    where f.id = feedback_id and f.user_id = auth.uid()
  ));

grant select on public.feedback_replies to authenticated;

-- --- 4) Kosten-Uebersicht (Platzhalter-Datenmodell, nur fuer die Admin-App) -
-- Keine RLS-Policy fuer "authenticated" noetig - das ist reine Betriebs-
-- information des Admins, Nutzer der Weinapp sehen das nie.
create table public.admin_costs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  label text not null,
  amount numeric(10, 2) not null,
  note text
);

alter table public.admin_costs enable row level security;
-- Bewusst keine Policies fuer "authenticated" - nur service_role (Admin-App)
-- kommt ueberhaupt an diese Tabelle heran.
