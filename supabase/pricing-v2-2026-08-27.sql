-- Neues Preismodell: Ober- und Untergrenze statt nur einer gemeinsamen
-- Mindestsumme. "refresh"/"neue_weine" teilen sich eine Standard-Spanne
-- (5-30 CHF), "ultra" (Import-Aktualisierung inkl. Foto) bekommt eine
-- hoehere Spanne (10-50 CHF) wegen des zusaetzlichen Aufwands fuers
-- Bilder einfuegen. Die alte minimum_price-Spalte bleibt unangetastet
-- (wird im Code nicht mehr gelesen, aber nicht geloescht).

alter table public.pricing_config
  add column if not exists standard_min_price numeric(10,2) not null default 5,
  add column if not exists standard_max_price numeric(10,2) not null default 30,
  add column if not exists ultra_min_price numeric(10,2) not null default 10,
  add column if not exists ultra_max_price numeric(10,2) not null default 50;

update public.pricing_config
set refresh_price = 1.30,
    neue_weine_price = 1.00,
    ultra_price = 2.20
where id = 1;
