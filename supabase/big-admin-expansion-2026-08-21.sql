-- Grosses Admin-Update: Zahlungsanfragen, Auftraege (bezahlte KI-Anreicherung),
-- Nutzer-Nachrichten (Chat-Bubble), Admin-Notizen pro Nutzer.
--
-- Im Supabase Dashboard -> SQL Editor der HAUPT-Weinapp-Datenbank ausfuehren.
-- Kein extra GRANT fuer service_role noetig - der Default-Privileges-Fix aus
-- expand-admin-2026-08-20.sql deckt auch diese neuen Tabellen automatisch ab.

-- --- Auftraege (Nutzer bestellt bezahlte KI-Datenanreicherung) --------------
create table public.enrichment_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('trinkfenster', 'name', 'refresh', 'neue_weine', 'ultra')),
  wine_ids uuid[] not null,
  wine_count integer not null,
  estimated_price numeric(10, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'cancelled')),
  note text
);

create index enrichment_orders_user_id_idx on public.enrichment_orders (user_id);

alter table public.enrichment_orders enable row level security;

create policy "eigenen Auftrag anlegen"
  on public.enrichment_orders
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "eigene Auftraege sehen"
  on public.enrichment_orders
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select, insert on public.enrichment_orders to authenticated;

-- --- Zahlungsanfragen (informell - kein echtes Bezahlsystem) ----------------
-- Admin erstellt eine Anfrage (z.B. aus einem Auftrag heraus), Nutzer sieht
-- sie in der App. Bezahlung laeuft ausserhalb der App (TWINT/Ueberweisung) -
-- der Admin markiert manuell als bezahlt.
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10, 2) not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  paid_at timestamptz,
  order_id uuid references public.enrichment_orders(id) on delete set null
);

create index payment_requests_user_id_idx on public.payment_requests (user_id);

alter table public.payment_requests enable row level security;

create policy "eigene Zahlungsanfragen sehen"
  on public.payment_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.payment_requests to authenticated;

-- --- Nachrichten an den Betreiber (allgemein / Aenderungsvorschlag) --------
create table public.user_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('allgemein', 'vorschlag')),
  message text not null,
  read_at timestamptz
);

create index user_messages_user_id_idx on public.user_messages (user_id);

alter table public.user_messages enable row level security;

create policy "eigene Nachricht anlegen"
  on public.user_messages
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "eigene Nachrichten sehen"
  on public.user_messages
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select, insert on public.user_messages to authenticated;

-- --- Admin-Notizen pro Nutzer (nur intern, Nutzer sieht das nie) -----------
create table public.admin_user_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note text not null
);

create index admin_user_notes_user_id_idx on public.admin_user_notes (user_id);

alter table public.admin_user_notes enable row level security;
-- Bewusst keine Policies fuer "authenticated" - nur service_role (Admin-App)
-- kommt an diese Tabelle heran.
