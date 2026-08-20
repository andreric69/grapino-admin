-- Ankuendigungen erweitern: gezielt an eine einzelne Person statt nur an
-- alle, ein Typ (Ankuendigung/Update) und eine Wiederholung (alle N Tage
-- erneut anzeigen, statt nur einmalig).
--
-- Im Supabase Dashboard -> SQL Editor der HAUPT-Weinapp-Datenbank ausfuehren.

alter table public.announcements
  add column target_user_id uuid references auth.users(id) on delete cascade,
  add column type text not null default 'news' check (type in ('news', 'update')),
  add column repeat_every_days integer check (repeat_every_days is null or repeat_every_days > 0);

-- Alte Policy ersetzen: ein Nutzer sieht aktive Ankuendigungen, die entweder
-- an alle gehen (target_user_id ist leer) oder gezielt an ihn gerichtet sind.
drop policy "aktive Ankuendigungen lesen" on public.announcements;
create policy "aktive Ankuendigungen lesen"
  on public.announcements
  for select
  to authenticated
  using (is_active = true and (target_user_id is null or target_user_id = auth.uid()));

-- Merkt sich pro Nutzer, wann er eine Ankuendigung zuletzt weggeklickt hat -
-- noetig, damit "alle N Tage wiederholen" nutzer- statt nur
-- geraetebezogen funktioniert (bisher war das rein lokal im Browser).
create table public.announcement_dismissals (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now()
);

create unique index announcement_dismissals_unique_idx on public.announcement_dismissals (announcement_id, user_id);

alter table public.announcement_dismissals enable row level security;

create policy "eigene Bestaetigung anlegen"
  on public.announcement_dismissals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "eigene Bestaetigung aktualisieren"
  on public.announcement_dismissals
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "eigene Bestaetigungen sehen"
  on public.announcement_dismissals
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update on public.announcement_dismissals to authenticated;

-- Kein extra GRANT fuer service_role noetig - der Default-Privileges-Fix von
-- eben deckt auch diese neue Tabelle automatisch ab.
