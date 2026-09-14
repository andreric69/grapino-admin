-- Ergaenzt admin_error_log um eine "source"-Spalte, damit Fehler-Log-
-- Eintraege aus der Haupt-Weinapp (api/*.ts, siehe
-- "claude weinapp/api/_errorLog.ts") klar von eigenen Admin-App-Fehlern
-- (api/_health.ts) unterschieden werden koennen. Hintergrund: ein Multi-
-- Agenten-Audit stellte fest, dass Fehler in den zahlungsrelevanten
-- Serverless Functions der Weinapp (stripe-webhook.ts,
-- create-checkout-session.ts, create-payment-checkout-session.ts,
-- recognize-label.ts) bisher nirgends geloggt/gemeldet wurden - nur
-- console.error, das im Vercel-Log verschwindet. Die Weinapp schreibt jetzt
-- ueber ihren eigenen SUPABASE_SERVICE_ROLE_KEY direkt in dieselbe Tabelle
-- (gleiches Supabase-Projekt, siehe NOTFALL/README.md Abschnitt 4).
--
-- admin_error_log selbst ist HISTORISCH nicht als SQL-Migration im Repo
-- entstanden (direkt im Supabase-Dashboard angelegt, wie auch
-- payment_requests - siehe NOTFALL/README.md Abschnitt 9), daher hier nur
-- ein additiver, rueckwaertskompatibler ALTER TABLE statt eines CREATE
-- TABLE. Bekannte Spalten (per Live-Introspektion bestaetigt, 2026-09-14):
-- id, created_at, endpoint, message, detail, notified_at.
--
-- "add column if not exists" + DEFAULT macht das sicher fuer bereits
-- existierende Zeilen (alle bisherigen Eintraege stammen aus der Admin-App
-- und bekommen automatisch 'admin') und fuer ein Deployment, das bereits vor
-- dieser manuellen Migration live ist (der Code in _health.ts/_errorLog.ts
-- gibt "source" beim Insert explizit mit an, faellt aber nicht auseinander,
-- falls die Spalte kurzzeitig noch fehlt - siehe "Optionale Spalte"-Fallback-
-- Lektion im README, hier zusaetzlich durch den DEFAULT abgesichert).
alter table admin_error_log
  add column if not exists source text not null default 'admin';

comment on column admin_error_log.source is
  'Woher der Fehler stammt: "admin" (Admin-App, api/_health.ts) oder "weinapp" (Haupt-Weinapp, api/_errorLog.ts). Das "endpoint"-Feld nennt zusaetzlich den konkreten Endpunkt (z. B. "stripe-webhook").';
