import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin, listAllUsers } from './_supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError, errorMessage } from './_health.js';
import { logAdminAction } from './_activityLog.js';

// "Deaktivieren" heisst: 10 Jahre gesperrt (Supabase kennt kein permanentes
// Sperren, nur eine Dauer) - in der Praxis dauerhaft, aber jederzeit ueber
// "none" wieder aufhebbar, ohne dass Daten angetastet werden.
const BAN_DURATION = '87600h';

interface AdminUserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  wineCount: number;
  isBlocked: boolean;
  blockReason: string | null;
  blockAmount: number | null;
  trialEndsAt: string | null;
  aiDailyLimit: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  // Neuste Zahlungsanfrage (unabhaengig vom Status) - fuer eine Ampel in der
  // Nutzerliste, ohne dass man dafuer erst ins Detail klicken muss. Betrifft
  // nur noch Aktualisierungs-Auftraege (TWINT/Ueberweisung von Hand) - der
  // App-Zugang selbst laeuft ueber Stripe-Abos, siehe plan/stripeCustomerId/
  // stripeSubscriptionId oben.
  lastPayment: { reason: string; status: string; createdAt: string } | null;
  // 3-Stufen-Abomodell der Kunden-App (Basis/Pro/Ultra), gespeichert in
  // derselben Supabase-DB. Default 'ultra' greift sowohl, wenn die Zeile
  // fehlt, ALS AUCH, wenn die Spalte selbst noch nicht existiert (Migration
  // claude weinapp/supabase/user-plan-2026-09-13.sql noch nicht angewendet) -
  // siehe fetchAllUserAccess()/fetchUserAccess() unten.
  plan: 'basis' | 'pro' | 'ultra';
}

type PlanTier = 'basis' | 'pro' | 'ultra';

function isValidPlan(v: unknown): v is PlanTier {
  return v === 'basis' || v === 'pro' || v === 'ultra';
}

interface UserAccessFields {
  is_blocked: boolean;
  block_reason: string | null;
  block_amount: number | null;
  trial_ends_at: string | null;
  ai_daily_limit: number | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  // Fehlt, wenn die Spalte noch nicht existiert (siehe fetchAllUserAccess/
  // fetchUserAccess) - Aufrufer muessen trotzdem immer auf 'ultra' zurueckfallen.
  plan?: PlanTier;
}

const ACCESS_COLUMNS_WITHOUT_PLAN =
  'is_blocked, block_reason, block_amount, trial_ends_at, ai_daily_limit, stripe_customer_id, stripe_subscription_id';

/**
 * Erkennt Postgres' "column ... does not exist" fuer eine bestimmte Spalte -
 * gleiches Muster wie in backup.ts (handleTrashPurge) fuer deleted_at, hier
 * fuer plan angewendet: die Migration user-plan-2026-09-13.sql laeuft in
 * einem separaten Repo und wird von Andrin selbst angewendet, dieser Code
 * muss also sowohl vor als auch nach der Anwendung funktionieren.
 */
function isMissingColumnError(e: unknown, column: string): boolean {
  return new RegExp(`column .*${column}.* does not exist`, 'i').test(errorMessage(e));
}

/** Laedt user_access fuer ALLE Nutzer, mit Fallback ohne `plan`-Spalte falls die Migration noch nicht lief. */
async function fetchAllUserAccess(supabase: SupabaseClient): Promise<Map<string, UserAccessFields>> {
  const withPlan = await supabase.from('user_access').select(`user_id, ${ACCESS_COLUMNS_WITHOUT_PLAN}, plan`);
  if (!withPlan.error) {
    return new Map((withPlan.data ?? []).map((a) => [a.user_id as string, a as UserAccessFields]));
  }
  if (!isMissingColumnError(withPlan.error, 'plan')) throw withPlan.error;

  const withoutPlan = await supabase.from('user_access').select(`user_id, ${ACCESS_COLUMNS_WITHOUT_PLAN}`);
  if (withoutPlan.error) throw withoutPlan.error;
  return new Map((withoutPlan.data ?? []).map((a) => [a.user_id as string, a as UserAccessFields]));
}

/** Laedt user_access fuer EINEN Nutzer, mit demselben Fallback wie fetchAllUserAccess(). */
async function fetchUserAccess(supabase: SupabaseClient, userId: string): Promise<UserAccessFields | null> {
  const withPlan = await supabase
    .from('user_access')
    .select(`${ACCESS_COLUMNS_WITHOUT_PLAN}, plan`)
    .eq('user_id', userId)
    .maybeSingle();
  if (!withPlan.error) return withPlan.data as UserAccessFields | null;
  if (!isMissingColumnError(withPlan.error, 'plan')) throw withPlan.error;

  const withoutPlan = await supabase.from('user_access').select(ACCESS_COLUMNS_WITHOUT_PLAN).eq('user_id', userId).maybeSingle();
  if (withoutPlan.error) throw withoutPlan.error;
  return withoutPlan.data as UserAccessFields | null;
}

async function listUsersWithWineCounts(supabase: SupabaseClient): Promise<AdminUserRow[]> {
  const allUsers = await listAllUsers(supabase);

  const [winesRes, accessByUser, paymentsRes] = await Promise.all([
    supabase.from('wines').select('user_id'),
    fetchAllUserAccess(supabase),
    supabase.from('payment_requests').select('user_id, reason, status, created_at').order('created_at', { ascending: false }),
  ]);
  if (winesRes.error) throw winesRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const wineCountByUser = new Map<string, number>();
  for (const row of winesRes.data ?? []) {
    wineCountByUser.set(row.user_id, (wineCountByUser.get(row.user_id) ?? 0) + 1);
  }
  // Ergebnis ist bereits nach created_at absteigend sortiert (siehe Query
  // oben) - das erste Vorkommen pro Nutzer ist damit automatisch die
  // neuste Zahlungsanfrage.
  const lastPaymentByUser = new Map<string, { reason: string; status: string; createdAt: string }>();
  for (const p of paymentsRes.data ?? []) {
    if (!lastPaymentByUser.has(p.user_id)) {
      lastPaymentByUser.set(p.user_id, { reason: p.reason, status: p.status, createdAt: p.created_at });
    }
  }

  return allUsers
    .map((u) => {
      const access = accessByUser.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        displayName: (u.user_metadata?.display_name as string | undefined) ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        // ban_duration liegt weit in der Zukunft, wenn aktiv gesperrt; sonst leer.
        bannedUntil: u.banned_until && new Date(u.banned_until) > new Date() ? u.banned_until : null,
        wineCount: wineCountByUser.get(u.id) ?? 0,
        isBlocked: access?.is_blocked ?? false,
        blockReason: access?.block_reason ?? null,
        blockAmount: access?.block_amount ?? null,
        trialEndsAt: access?.trial_ends_at ?? null,
        aiDailyLimit: access?.ai_daily_limit ?? null,
        stripeCustomerId: access?.stripe_customer_id ?? null,
        stripeSubscriptionId: access?.stripe_subscription_id ?? null,
        lastPayment: lastPaymentByUser.get(u.id) ?? null,
        plan: access?.plan ?? 'ultra',
      };
    })
    .sort((a, b) => a.email?.localeCompare(b.email ?? '') ?? 0);
}

async function getUserDetail(supabase: SupabaseClient, userId: string) {
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError) throw userError;
  const user = userData.user;

  const [winesRes, announcementsRes, dismissalsRes, feedbackRes, deletionRes, paymentRes, ordersRes, notesRes, access] =
    await Promise.all([
      supabase.from('wines').select('id, name, created_at, price, is_consumed, is_wishlist').eq('user_id', userId),
      supabase
        .from('announcements')
        .select('id, created_at, title, type, target_user_id')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('announcement_dismissals').select('announcement_id, dismissed_at').eq('user_id', userId),
      supabase.from('app_feedback').select('id, created_at, rating').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase
        .from('deletion_requests')
        .select('id, created_at, status')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('payment_requests')
        .select('id, created_at, amount, reason, status, paid_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('enrichment_orders')
        .select('id, created_at, category, wine_count, estimated_price, status, note')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase.from('admin_user_notes').select('id, created_at, note').eq('user_id', userId).order('created_at', { ascending: false }),
      fetchUserAccess(supabase, userId),
    ]);
  for (const r of [winesRes, announcementsRes, dismissalsRes, feedbackRes, deletionRes, paymentRes, ordersRes, notesRes]) {
    if (r.error) throw r.error;
  }

  const dismissedAt = new Map((dismissalsRes.data ?? []).map((d) => [d.announcement_id, d.dismissed_at]));
  const announcements = (announcementsRes.data ?? [])
    .filter((a) => a.target_user_id === null || a.target_user_id === userId)
    .slice(0, 20)
    .map((a) => ({ ...a, seenAt: dismissedAt.get(a.id) ?? null }));

  const wines = winesRes.data ?? [];
  const activeWines = wines.filter((w) => !w.is_consumed && !w.is_wishlist);

  return {
    profile: {
      id: user.id,
      email: user.email ?? null,
      displayName: (user.user_metadata?.display_name as string | undefined) ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      bannedUntil: user.banned_until && new Date(user.banned_until) > new Date() ? user.banned_until : null,
    },
    access: {
      isBlocked: access?.is_blocked ?? false,
      blockReason: access?.block_reason ?? null,
      blockAmount: access?.block_amount ?? null,
      trialEndsAt: access?.trial_ends_at ?? null,
      aiDailyLimit: access?.ai_daily_limit ?? null,
      stripeCustomerId: access?.stripe_customer_id ?? null,
      stripeSubscriptionId: access?.stripe_subscription_id ?? null,
      plan: access?.plan ?? 'ultra',
    },
    wineStats: {
      total: wines.length,
      active: activeWines.length,
      totalValue: activeWines.reduce((sum, w) => sum + (w.price ?? 0), 0),
      withPrice: activeWines.filter((w) => w.price !== null).length,
    },
    // Einzelne Weine fuer die Zeitleiste (zusaetzlich zur Aggregat-Statistik
    // oben, die nicht entfernt wird - anderer Code koennte sich darauf
    // verlassen). Enthaelt bewusst auch Wunschliste/konsumierte Weine, damit
    // die Zeitleiste vollstaendig ist.
    wines: wines.map((w) => ({ id: w.id, name: w.name, created_at: w.created_at, price: w.price, is_consumed: w.is_consumed })),
    announcements,
    feedback: feedbackRes.data ?? [],
    deletionRequests: deletionRes.data ?? [],
    paymentRequests: paymentRes.data ?? [],
    orders: ordersRes.data ?? [],
    notes: notesRes.data ?? [],
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === 'GET') {
      const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
      if (userId) {
        res.status(200).json(await getUserDetail(supabase, userId));
        return;
      }
      const users = await listUsersWithWineCounts(supabase);
      res.status(200).json({ users });
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as {
        userId?: string;
        action?: 'ban' | 'unban' | 'create' | 'setDisplayName' | 'addNote' | 'setAccess' | 'generateRecoveryLink';
        email?: string;
        password?: string;
        displayName?: string;
        note?: string;
        isBlocked?: boolean;
        blockReason?: string | null;
        blockAmount?: number | null;
        trialEndsAt?: string | null;
        aiDailyLimit?: number | null;
        plan?: PlanTier;
      };

      if (body.action === 'generateRecoveryLink') {
        if (!body.userId) {
          res.status(400).json({ error: 'userId erforderlich.' });
          return;
        }
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(body.userId);
        if (userError) throw userError;
        const email = userData.user?.email;
        if (!email) {
          res.status(400).json({ error: 'Nutzer hat keine E-Mail-Adresse.' });
          return;
        }
        const { data, error } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: 'https://weinsammlung-two.vercel.app/' },
        });
        if (error) throw error;
        res.status(200).json({ link: data.properties.action_link });
        return;
      }

      if (body.action === 'setAccess') {
        if (!body.userId) {
          res.status(400).json({ error: 'userId erforderlich.' });
          return;
        }

        // Vorherigen Stand VOR dem Update lesen - einerseits um zu erkennen,
        // ob sich is_blocked/trial_ends_at/plan ueberhaupt geaendert haben
        // (ein reines "Speichern"-Klick ohne echte Aenderung soll nicht als
        // Admin-Aktion geloggt werden), andererseits als Basis fuer die
        // Teil-Aktualisierung unten. Fehlt die Zeile noch komplett (oder die
        // plan-Spalte selbst, siehe fetchUserAccess), gelten dieselben Defaults
        // wie in listUsersWithWineCounts() oben (false/null/'ultra').
        const currentAccess = await fetchUserAccess(supabase, body.userId);
        const oldIsBlocked = currentAccess?.is_blocked ?? false;
        const oldBlockReason = currentAccess?.block_reason ?? null;
        const oldBlockAmount = currentAccess?.block_amount ?? null;
        const oldTrialEndsAt = currentAccess?.trial_ends_at ?? null;
        const oldAiDailyLimit = currentAccess?.ai_daily_limit ?? null;
        const oldPlan: PlanTier = currentAccess?.plan ?? 'ultra';

        // Teil-Aktualisierung: ein Feld wird nur veraendert, wenn es im
        // Request ueberhaupt mitgeschickt wurde ("in body") - sonst bleibt
        // der bisherige Wert stehen. Noetig, seit Massenaktionen (Nutzerliste,
        // "X ausgewaehlt") nur EIN Feld pro Aufruf aendern wollen (z. B. nur
        // blockieren), ohne dabei versehentlich Testphase/KI-Limit/Abo-Stufe
        // der betroffenen Nutzer auf Standardwerte zurueckzusetzen. Die
        // Einzelnutzer-Ansicht (UserDetailPanel) schickt weiterhin immer alle
        // Felder mit - fuer sie aendert sich das Verhalten nicht.
        const newIsBlocked = 'isBlocked' in body ? !!body.isBlocked : oldIsBlocked;
        const newBlockReason = 'blockReason' in body ? body.blockReason?.trim() || null : oldBlockReason;
        const newBlockAmount =
          'blockAmount' in body
            ? typeof body.blockAmount === 'number' && !Number.isNaN(body.blockAmount)
              ? body.blockAmount
              : null
            : oldBlockAmount;
        const newTrialEndsAt = 'trialEndsAt' in body ? body.trialEndsAt || null : oldTrialEndsAt;
        // Tageslimit muss eine nicht-negative ganze Zahl sein (0 = KI-Erkennung
        // fuer diesen Nutzer effektiv deaktiviert) - null bedeutet "globaler
        // Standard", nicht "0 Scans erlaubt".
        const newAiDailyLimit =
          'aiDailyLimit' in body
            ? typeof body.aiDailyLimit === 'number' && Number.isInteger(body.aiDailyLimit) && body.aiDailyLimit >= 0
              ? body.aiDailyLimit
              : null
            : oldAiDailyLimit;
        // plan ist optional (nicht jeder setAccess-Aufruf aendert die
        // Abo-Stufe) - fehlt/ungueltig, bleibt die bisherige Stufe unangetastet
        // statt versehentlich auf 'ultra' zurueckzufallen.
        const newPlan: PlanTier = isValidPlan(body.plan) ? body.plan : oldPlan;

        const upsertRow: Record<string, unknown> = {
          user_id: body.userId,
          is_blocked: newIsBlocked,
          block_reason: newBlockReason,
          block_amount: newBlockAmount,
          trial_ends_at: newTrialEndsAt,
          ai_daily_limit: newAiDailyLimit,
          plan: newPlan,
          updated_at: new Date().toISOString(),
        };
        let { error } = await supabase.from('user_access').upsert(upsertRow, { onConflict: 'user_id' });
        if (error && isMissingColumnError(error, 'plan')) {
          // Migration noch nicht angewendet - ohne plan-Spalte schreiben statt
          // die gesamte Zugangs-Aenderung (Block/Testabo/...) daran scheitern
          // zu lassen.
          const { plan: _plan, ...rowWithoutPlan } = upsertRow;
          ({ error } = await supabase.from('user_access').upsert(rowWithoutPlan, { onConflict: 'user_id' }));
        }
        if (error) throw error;

        // Logging ist ein reiner Nebeneffekt (siehe logAdminAction - wirft nie)
        // und darf die eigentliche, bereits erfolgreiche Aenderung nicht mehr
        // beeinflussen. E-Mail nur bei Bedarf nachladen, nicht bei jedem
        // setAccess-Aufruf.
        if (oldIsBlocked !== newIsBlocked || oldTrialEndsAt !== newTrialEndsAt || oldPlan !== newPlan) {
          const { data: userData } = await supabase.auth.admin.getUserById(body.userId);
          const email = userData.user?.email ?? null;
          if (oldIsBlocked !== newIsBlocked) {
            await logAdminAction(supabase, newIsBlocked ? 'user_blocked' : 'user_unblocked', email, body.userId);
          }
          if (oldTrialEndsAt !== newTrialEndsAt) {
            await logAdminAction(supabase, 'trial_extended', newTrialEndsAt ? `bis ${newTrialEndsAt}` : 'entfernt', body.userId);
          }
          if (oldPlan !== newPlan) {
            await logAdminAction(supabase, 'plan_changed', `${oldPlan} -> ${newPlan}`, body.userId);
          }
        }

        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === 'create') {
        const email = body.email?.trim();
        const password = body.password;
        if (!email || !password || password.length < 8) {
          res.status(400).json({ error: 'E-Mail und Passwort (mind. 8 Zeichen) erforderlich.' });
          return;
        }
        const { error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: body.displayName?.trim() ? { display_name: body.displayName.trim() } : undefined,
        });
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === 'setDisplayName') {
        if (!body.userId) {
          res.status(400).json({ error: 'userId erforderlich.' });
          return;
        }
        const { error } = await supabase.auth.admin.updateUserById(body.userId, {
          user_metadata: { display_name: body.displayName?.trim() || null },
        });
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === 'addNote') {
        if (!body.userId || !body.note?.trim()) {
          res.status(400).json({ error: 'userId und note erforderlich.' });
          return;
        }
        const { error } = await supabase.from('admin_user_notes').insert({ user_id: body.userId, note: body.note.trim() });
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }

      if (!body.userId || (body.action !== 'ban' && body.action !== 'unban')) {
        res.status(400).json({ error: 'userId und action erforderlich.' });
        return;
      }
      const { error } = await supabase.auth.admin.updateUserById(body.userId, {
        ban_duration: body.action === 'ban' ? BAN_DURATION : 'none',
      });
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    await logError(getSupabaseAdmin(), 'users', e);
    res.status(500).json({ error: errorMessage(e) });
  }
}
