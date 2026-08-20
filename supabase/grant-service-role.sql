-- Die Admin-App greift mit dem service_role-Schluessel per PostgREST direkt
-- auf Tabellen zu (z.B. Weinanzahl pro Nutzer, Loeschanfragen genehmigen).
-- service_role umgeht zwar Row-Level-Security, braucht aber trotzdem ganz
-- normale Postgres-GRANTs auf die Tabellen - die hat dieses Projekt bisher
-- nicht (deshalb "permission denied for table" bei jedem Admin-Aufruf).
--
-- Im Supabase Dashboard -> SQL Editor der HAUPT-Weinapp-Datenbank ausfuehren
-- (dieselbe Datenbank, die auch die wines-Tabelle enthaelt).

grant usage on schema public to service_role;
grant select, delete on public.wines to service_role;
grant select, update on public.deletion_requests to service_role;
