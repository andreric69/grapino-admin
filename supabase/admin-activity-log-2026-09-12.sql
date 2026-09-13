-- Protokoll fuer Andrins eigene, wichtige Admin-Aktionen (Nutzer sperren/
-- entsperren, Testabo verlaengern, Preise aendern) - NICHT zu verwechseln mit
-- dem bestehenden Nutzer-Aktivitaets-Feed (Weine/Feedback/Loeschanfragen,
-- siehe api/reports.ts ?resource=activity). Dient nur der eigenen
-- Nachvollziehbarkeit ("wann habe ich was geaendert"), kein Sicherheits-/
-- Compliance-Audit-Log.
--
-- Im Supabase Dashboard -> SQL Editor der HAUPT-Weinapp-Datenbank ausfuehren.
-- Kein extra GRANT fuer service_role noetig - der Default-Privileges-Fix aus
-- expand-admin-2026-08-20.sql deckt auch diese neue Tabelle automatisch ab.

create table public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action text not null,
  detail text,
  user_id uuid references auth.users(id) on delete set null
);

create index admin_activity_log_created_at_idx on public.admin_activity_log (created_at desc);

alter table public.admin_activity_log enable row level security;
-- Bewusst keine Policies fuer "authenticated" - nur service_role (Admin-App)
-- kommt an diese Tabelle heran, wie bei admin_user_notes.
