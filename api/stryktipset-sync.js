// api/stryktipset-fetch.js

const SVENSKA_SPEL_URL =
  'https://api.spela.svenskaspel.se/draw/1/stryktipset/draws/';

function toNumber(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toInt(s) {
  if (s == null) return null;
  const n = parseInt(String(s), 10);
  return Number.isFinite(n) ? n : null;
}

function pickTeam(participants, type) {
  const p = (participants || []).find(x => x?.type === type);
  return p?.name || p?.name || null;
}

export default async function handler(req, res) {
  try {
    const r = await fetch(SVENSKA_SPEL_URL, {
      headers: {
        // server-side fetch -> ingen CORS-problematik
        'user-agent': 'stryktipstabellen/1.0',
        accept: 'application/json',
      },
    });

    if (!r.ok) {
      return res.status(502).json({ ok: false, error: `Upstream ${r.status}` });
    }

    const json = await r.json();
    const draw = json?.draws?.[0];
    const events = Array.isArray(draw?.drawEvents) ? draw.drawEvents : [];

    if (!draw?.drawNumber || events.length === 0) {
      return res.status(500).json({
        ok: false,
        error: 'Unexpected API shape (no draw/drawEvents)',
      });
    }

    const rows = events.map(e => {
      const participants = e?.match?.participants || [];
      const home = pickTeam(participants, 'home');
      const away = pickTeam(participants, 'away');

      const league = e?.match?.league?.name || null;

      const odds1 = toNumber(e?.odds?.one);
      const oddsX = toNumber(e?.odds?.x);
      const odds2 = toNumber(e?.odds?.two);

      const pct1 = toInt(e?.svenskaFolket?.one);
      const pctX = toInt(e?.svenskaFolket?.x);
      const pct2 = toInt(e?.svenskaFolket?.two);

      return {
        matchNo: e?.eventNumber ?? null,
        home,
        away,
        league,
        odds: { '1': odds1, 'X': oddsX, '2': odds2 },
        percent: { '1': pct1, 'X': pctX, '2': pct2 },
      };
    });

    return res.status(200).json({
      ok: true,
      drawNumber: draw.drawNumber,
      productName: draw.productName ?? null,
      regCloseTime: draw.regCloseTime ?? null,
      rows,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
