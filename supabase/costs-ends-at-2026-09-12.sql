-- Erlaubt es, eine "monatlich" laufende Kosten sauber zu beenden (z.B. bei
-- Kuendigung eines Abos), ohne die Zeile zu loeschen - eine Loeschung wuerde
-- den Eintrag auch aus VERGANGENEN Monaten entfernen, in denen die Kosten
-- tatsaechlich angefallen ist, und damit die historische Buchhaltung
-- verfaelschen. NULL (Standard) bedeutet weiterhin "laeuft unbefristet",
-- also exakt das bisherige Verhalten - rein additiv, keine bestehenden
-- Zeilen aendern sich.

alter table public.admin_costs add column if not exists ends_at timestamptz;
