import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';

const CATEGORY_LABELS: Record<string, string> = {
  trinkfenster: 'Nur Trinkfenster',
  name: 'Nur Name',
  refresh: 'Refresh (alles aktualisieren)',
  neue_weine: 'Fuer neue Weine',
  ultra: 'Ultra Import Paket',
};

const CATEGORY_INSTRUCTIONS: Record<string, string> = {
  trinkfenster: 'Fuer die unten gelisteten Weine bitte AUSSCHLIESSLICH das Trinkfenster (drink_from/drink_to) recherchieren und eintragen. Sonst nichts aendern.',
  name: 'Fuer die unten gelisteten Weine bitte AUSSCHLIESSLICH Name/Bezeichnung pruefen und ggf. korrigieren. Sonst nichts aendern.',
  refresh: 'Fuer die unten gelisteten Weine bitte ALLE recherchierbaren Angaben aktualisieren (Region, Subregion, Rebsorte, Trinkfenster, Kritiker-Punkte, Food-Pairing etc).',
  neue_weine: 'Die unten gelisteten Weine sind neu und haben kaum Angaben - bitte alle Basisdaten ergaenzen (Region, Rebsorte, Trinkfenster etc), wo recherchierbar.',
  ultra: 'Fuer die unten gelisteten Weine bitte RUNDUM-SORGLOS-Recherche: Fotos (Etikett, klar erkennbar), Region/Subregion, Rebsorte, Trinkfenster, Kritiker-Punkte, Food-Pairing - alles Verfuegbare.',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('enrichment_orders')
        .select('id, created_at, user_id, category, wine_ids, wine_count, estimated_price, status, note')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 200 });
      if (usersError) throw usersError;
      const emailById = new Map(usersData.users.map((u) => [u.id, u.email ?? null]));

      const orders = data ?? [];
      const allWineIds = Array.from(new Set(orders.flatMap((o) => o.wine_ids as string[])));
      const { data: wines, error: winesError } =
        allWineIds.length > 0
          ? await supabase.from('wines').select('id, name, producer, vintage').in('id', allWineIds)
          : { data: [], error: null };
      if (winesError) throw winesError;
      interface WineRef {
        id: string;
        name: string;
        producer: string | null;
        vintage: number | null;
      }
      const wineById = new Map<string, WineRef>((wines ?? []).map((w) => [w.id, w as WineRef]));

      res.status(200).json({
        orders: orders.map((o) => {
          const wineList = (o.wine_ids as string[])
            .map((id) => wineById.get(id))
            .filter((w): w is WineRef => w !== undefined);
          const prompt = [
            CATEGORY_INSTRUCTIONS[o.category],
            o.note ? `Notiz vom Nutzer: ${o.note}` : null,
            '',
            'Weine:',
            ...wineList.map((w) => `- ${w.name}${w.producer ? ' / ' + w.producer : ''}${w.vintage ? ' ' + w.vintage : ''} (id: ${w.id})`),
          ]
            .filter((line) => line !== null)
            .join('\n');
          return {
            ...o,
            email: emailById.get(o.user_id) ?? null,
            categoryLabel: CATEGORY_LABELS[o.category] ?? o.category,
            prompt,
          };
        }),
      });
      return;
    }

    if (req.method === 'PATCH') {
      const { id, status } = (req.body ?? {}) as {
        id?: string;
        status?: 'pending' | 'in_progress' | 'done' | 'cancelled';
      };
      if (!id || !status) {
        res.status(400).json({ error: 'id und status erforderlich.' });
        return;
      }
      const { error } = await supabase.from('enrichment_orders').update({ status }).eq('id', id);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
