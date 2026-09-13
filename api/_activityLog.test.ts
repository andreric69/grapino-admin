import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logAdminAction } from './_activityLog.js';

// Minimaler Fake fuer die eine Methodenkette, die logAdminAction tatsaechlich
// benutzt (supabase.from(...).insert(...)) - kein echter Supabase-Client
// noetig, um das Nie-werfen-Verhalten zu pruefen.
function fakeSupabase(insertResult: { error: unknown } | Promise<never>): SupabaseClient {
  return {
    from: () => ({
      insert: () => (insertResult instanceof Promise ? insertResult : Promise.resolve(insertResult)),
    }),
  } as unknown as SupabaseClient;
}

describe('logAdminAction', () => {
  it('schreibt eine Zeile mit den erwarteten Feldern', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient;

    await logAdminAction(supabase, 'user_blocked', 'a@b.ch', 'user-1');

    expect(supabase.from).toHaveBeenCalledWith('admin_activity_log');
    expect(insert).toHaveBeenCalledWith({ action: 'user_blocked', detail: 'a@b.ch', user_id: 'user-1' });
  });

  it('wirft NICHT, wenn Supabase einen Fehler zurueckgibt (Insert schlaegt fehl)', async () => {
    const supabase = fakeSupabase({ error: { message: 'kaputt' } });
    await expect(logAdminAction(supabase, 'pricing_changed', 'x')).resolves.toBeUndefined();
  });

  it('wirft NICHT, wenn der Aufruf selbst eine Exception wirft (z. B. Netzwerkfehler)', async () => {
    const supabase = fakeSupabase(Promise.reject(new Error('Netzwerk kaputt')));
    await expect(logAdminAction(supabase, 'trial_extended')).resolves.toBeUndefined();
  });
});
