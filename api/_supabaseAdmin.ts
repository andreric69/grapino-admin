import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Supabase-Client mit dem service_role-Schluessel - umgeht Row-Level-Security
 * komplett. Wird ausschliesslich hier, serverseitig in den Vercel-Funktionen
 * erzeugt, nie im Frontend importiert.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen in den Umgebungsvariablen.');
  }
  client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

const USERS_PER_PAGE = 200;

/**
 * Laedt ALLE Nutzer, nicht nur die erste Seite - supabase.auth.admin.listUsers()
 * liefert standardmaessig nur 50, mit explizitem perPage bis zu 200 auf einmal.
 * An 9 Stellen im Code wurde bisher nur eine einzelne Seite mit perPage:200
 * abgefragt - ab dem 201. Nutzer waeren dessen Auftraege/Zahlungen/Nachrichten
 * etc. in der Admin-App klanglos ohne E-Mail-Zuordnung geblieben, und er waere
 * in der Nutzerliste komplett unsichtbar (nicht sperrbar, nicht blockierbar).
 */
export async function listAllUsers(supabase: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < USERS_PER_PAGE) break;
    page++;
  }
  return users;
}
