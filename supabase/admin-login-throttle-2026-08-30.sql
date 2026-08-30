-- Bremse gegen automatisiertes Durchprobieren des Admin-Passworts. Bisher
-- konnte /api/login beliebig oft hintereinander aufgerufen werden - dieses
-- eine Passwort schuetzt aber den kompletten Betrieb (service_role-Zugriff
-- auf alle Kundendaten). Eine einzelne Zeile speichert Fehlversuche und eine
-- optionale Sperrfrist; nur der Admin-Server (service_role) liest/schreibt
-- hier, darum keine Policies fuer "authenticated"/"anon".
--
-- Im Supabase Dashboard -> SQL Editor der Weinapp-Datenbank ausfuehren
-- (dieselbe Datenbank wie die Weinapp - siehe grant-service-role.sql).

create table public.admin_login_state (
  id integer primary key default 1 check (id = 1), -- absichtlich nur eine einzige Zeile
  failed_count integer not null default 0,
  locked_until timestamptz
);
insert into public.admin_login_state (id) values (1);

alter table public.admin_login_state enable row level security;
-- Bewusst keine Policy fuer authenticated/anon - nur service_role (umgeht RLS
-- ohnehin) darf diese Zeile lesen/schreiben.
