-- Loeschanfragen: der Nutzer loest in der Weinapp keine sofortige Loeschung
-- der ganzen Sammlung mehr aus, sondern nur noch eine Anfrage. Erst eine
-- Bestaetigung ueber die Admin-App fuehrt die eigentliche Loeschung aus.
--
-- Im Supabase Dashboard -> SQL Editor der HAUPT-Weinapp-Datenbank ausfuehren
-- (dieselbe Datenbank, die auch die wines-Tabelle enthaelt).

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  note text
);

create index deletion_requests_user_id_idx on public.deletion_requests (user_id);
create index deletion_requests_status_idx on public.deletion_requests (status);

alter table public.deletion_requests enable row level security;

-- Ein Nutzer darf eine eigene Anfrage anlegen und den Status seiner eigenen
-- Anfragen sehen - aber weder selbst genehmigen noch fremde Anfragen sehen.
-- Genehmigung/Ablehnung laeuft ausschliesslich ueber die Admin-App
-- (service_role-Schluessel, umgeht RLS ohnehin).
create policy "eigene Anfrage anlegen"
  on public.deletion_requests
  for insert
  with check (auth.uid() = user_id);

create policy "eigene Anfragen sehen"
  on public.deletion_requests
  for select
  using (auth.uid() = user_id);

-- Solange die Anfrage noch offen ist, kann der Nutzer sie selbst zuruecknehmen.
create policy "eigene offene Anfrage zuruecknehmen"
  on public.deletion_requests
  for delete
  using (auth.uid() = user_id and status = 'pending');

grant select, insert, delete on public.deletion_requests to authenticated;
