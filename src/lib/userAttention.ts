// Reine Berechnungen fuer den "Nutzer im Blick"-Abschnitt auf der
// Uebersichtsseite (OverviewPage) - getrennt von der Komponente ausgelagert,
// damit sich die drei Kategorien unabhaengig von React testen lassen (siehe
// gleiches Muster bei computeFinancialSummary in financials.ts).
//
// Es wird KEIN zusaetzlicher API-Aufruf gemacht - alle drei Funktionen
// arbeiten mit den Nutzerdaten, die OverviewPage ohnehin schon ueber
// GET /api/users laedt.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AttentionUser {
  id: string;
  email: string | null;
  displayName: string | null;
  isBlocked: boolean;
  lastPayment: { reason: string; status: string; createdAt: string } | null;
  trialEndsAt: string | null;
  lastSignInAt: string | null;
  createdAt: string;
}

export interface OverduePayment {
  user: AttentionUser;
  daysOverdue: number;
}

export interface TrialEndingSoon {
  user: AttentionUser;
  daysUntilEnd: number;
}

export interface InactiveUser {
  user: AttentionUser;
  /** null = noch nie eingeloggt (lastSignInAt war null) */
  daysInactive: number | null;
}

function daysSince(now: Date, iso: string): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / MS_PER_DAY);
}

/**
 * Zahlung ueberfaellig: letzte Zahlungsanfrage ist offen und seit mehr als
 * 14 Tagen unbeantwortet. Bereits blockierte Nutzer werden ausgeklammert -
 * das ist ein eigener, schon sichtbarer Zustand (siehe "Blockiert"-Badge in
 * UsersPage) und soll hier nicht doppelt auftauchen.
 */
export function findOverduePayments(users: AttentionUser[], now: Date = new Date()): OverduePayment[] {
  return users
    .filter((u) => !u.isBlocked && u.lastPayment !== null && u.lastPayment.status === 'open')
    .map((u) => ({ user: u, daysOverdue: daysSince(now, u.lastPayment!.createdAt) }))
    .filter(({ daysOverdue }) => daysOverdue > 14);
}

/**
 * Testphase laeuft bald ab: trialEndsAt liegt in der Zukunft, aber innerhalb
 * der naechsten 3 Tage. Nutzer, deren letzte Zahlungsanfrage bereits bezahlt
 * ist, werden ausgeklammert - das sind zahlende Kunden mit einem noch
 * gesetzten, aber nicht mehr relevanten alten Testabo-Datum.
 */
export function findTrialsEndingSoon(users: AttentionUser[], now: Date = new Date()): TrialEndingSoon[] {
  return users
    .filter((u) => u.trialEndsAt !== null)
    .filter((u) => !(u.lastPayment !== null && u.lastPayment.status === 'paid'))
    .map((u) => ({
      user: u,
      // Aufgerundet, damit "in 2 Tagen und ein paar Stunden" als "läuft in 3
      // Tagen ab" erscheint statt optimistisch als "in 2 Tagen" - lieber zu
      // frueh gewarnt als zu spaet.
      daysUntilEnd: Math.ceil((new Date(u.trialEndsAt!).getTime() - now.getTime()) / MS_PER_DAY),
    }))
    .filter(({ daysUntilEnd }) => daysUntilEnd > 0 && daysUntilEnd <= 3);
}

/**
 * Lange inaktiv: seit mehr als 60 Tagen nicht mehr eingeloggt (oder noch nie),
 * aber nur wenn das Konto selbst auch schon mehr als 14 Tage alt ist - sonst
 * wuerde ein gestern angelegter Nutzer, der sich seither nicht erneut
 * eingeloggt hat, faelschlich als "inaktiv" auftauchen.
 */
export function findInactiveUsers(users: AttentionUser[], now: Date = new Date()): InactiveUser[] {
  return users
    .filter((u) => daysSince(now, u.createdAt) > 14)
    .filter((u) => u.lastSignInAt === null || daysSince(now, u.lastSignInAt) > 60)
    .map((u) => ({
      user: u,
      daysInactive: u.lastSignInAt !== null ? daysSince(now, u.lastSignInAt) : null,
    }));
}
