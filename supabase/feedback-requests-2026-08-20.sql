-- Admin kann aktiv Feedback bei einer Person anfragen (statt nur zu warten,
-- bis die App von sich aus fragt). Das erzwingt beim naechsten App-Start das
-- Feedback-Popup, unabhaengig von der sonstigen 1-Stunden-Verzoegerung.
--
-- Im Supabase Dashboard -> SQL Editor der HAUPT-Weinapp-Datenbank ausfuehren.

create table public.feedback_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fulfilled_at timestamptz
);

create index feedback_requests_user_id_idx on public.feedback_requests (user_id);

alter table public.feedback_requests enable row level security;

create policy "eigene Anfrage sehen"
  on public.feedback_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Nur um "erledigt" markieren, nicht um selbst neue Anfragen zu erzeugen -
-- das darf ausschliesslich die Admin-App (service_role).
create policy "eigene Anfrage als erledigt markieren"
  on public.feedback_requests
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, update on public.feedback_requests to authenticated;

-- Kein extra GRANT fuer service_role noetig - der Default-Privileges-Fix von
-- eben deckt auch diese neue Tabelle automatisch ab.
