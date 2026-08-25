# Grapino Admin

Internes Verwaltungs-Tool für die [Grapino](../claude%20weinapp) Weinsammlungs-App. Nicht für Endnutzer gedacht, nirgends aus der Haupt-App heraus verlinkt.

## Funktionen (Ausbaustufen)

- [x] Login (einzelnes, fest hinterlegtes Admin-Passwort)
- [ ] Nutzerverwaltung (Liste, Deaktivieren/Reaktivieren)
- [ ] Löschanfragen (Nutzer beantragt Löschung der ganzen Sammlung in der Haupt-App, Admin bestätigt hier erst die tatsächliche Löschung)
- [ ] News/Ankündigungen (werden in der Haupt-App angezeigt)
- [ ] Kosten-Übersicht (Platzhalter)

## Architektur

- Frontend: React + Vite + TypeScript, rein statisch gebaut.
- Backend: Vercel-Funktionen in `api/` - laufen serverseitig, nutzen den Supabase `service_role`-Key (voller Datenbankzugriff, umgeht Row-Level-Security). Der Key ist **ausschliesslich** in Umgebungsvariablen hinterlegt, taucht nie im Frontend-Code auf.
- Login: kein Nutzerrollensystem, nur ein Passwort-Abgleich gegen `ADMIN_PASSWORD`. Bei Erfolg wird ein signiertes, 12 Stunden gültiges Session-Token ausgestellt (`api/_auth.ts`), das der Browser bei jedem weiteren `/api`-Aufruf mitschickt.

## Lokal einrichten

```bash
npm install
cp .env.example .env.local
```

`.env.local` ausfüllen:
- `ADMIN_PASSWORD` - frei gewähltes Passwort für den Login.
- `SESSION_SECRET` - langer Zufallstext (z. B. `openssl rand -hex 32`).
- `SUPABASE_URL` - dieselbe Projekt-URL wie in der Haupt-Weinapp.
- `SUPABASE_SERVICE_ROLE_KEY` - aus dem Supabase-Dashboard (Project Settings → API → `service_role` secret). **Niemals committen, niemals im Frontend verwenden.**
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` - Schlüsselpaar für Web-Push-Benachrichtigungen (Gesundheits-Seite), erzeugt via `web-push generate-vapid-keys` (oder `webpush.generateVAPIDKeys()`).
- `VAPID_SUBJECT` - `mailto:`-Adresse, die Push-Diensten als Kontakt gemeldet wird.
- `PUSH_WEBHOOK_SECRET` - beliebiger Zufallstext, muss identisch im Postgres-Trigger stehen, der `api/push?resource=notify-message` bei neuen Nachrichten aufruft (siehe `supabase/health-and-push-*.sql`, wird bewusst nicht committet, da es das Secret im Klartext enthält).

Für lokales Testen inkl. der `/api`-Funktionen wird die Vercel-CLI benötigt (`vercel dev`), da reines `vite dev` die Serverless-Funktionen nicht ausführt. Alternativ: direkt nach Vercel deployen und dort testen (wie bei der Haupt-App).

## Deployment

Wie bei der Haupt-Weinapp: GitHub-Repository verbinden, in Vercel als eigenes, separates Projekt importieren (Framework Preset: Vite), die Umgebungsvariablen oben eintragen, fertig - jeder Push deployt automatisch neu.
