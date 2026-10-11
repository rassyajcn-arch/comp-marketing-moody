// Penyimpanan bersama Moody Complimentary Log — Netlify Function + Netlify Blobs.
// Endpoint: /api/data
//   GET  → semua catatan + katalog
//   POST → {action:"save"|"remove"|"saveKatalog", ...}
// Opsional: set environment variable MOODY_PIN di Netlify untuk mewajibkan kode tim.
import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const MAX_ENTRY_BYTES = 60_000;

async function readAll(store) {
  const { blobs } = await store.list({ prefix: "entries/" });
  const entries = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
  const katalog = await store.get("katalog", { type: "json" });
  return { ok: true, entries, katalog: Array.isArray(katalog) && katalog.length ? katalog : null };
}

export default async (req) => {
  const store = getStore({ name: "moody-compliment", consistency: "strong" });
  const pin = Netlify.env.get("MOODY_PIN") || "";
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (pin && url.searchParams.get("pin") !== pin) return json({ ok: false, error: "pin" });
    return json(await readAll(store));
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: "data tidak valid" }, 400); }
    if (pin && body.pin !== pin) return json({ ok: false, error: "pin" });

    const id = String(body.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);

    if (body.action === "save") {
      if (!id) return json({ ok: false, error: "id kosong" }, 400);
      const data = { ...(body.data || {}), id };
      if (JSON.stringify(data).length > MAX_ENTRY_BYTES) return json({ ok: false, error: "catatan terlalu panjang" }, 400);
      await store.setJSON("entries/" + id, data);
    } else if (body.action === "remove") {
      if (id) await store.delete("entries/" + id);
    } else if (body.action === "saveKatalog") {
      const items = (Array.isArray(body.items) ? body.items : [])
        .filter((i) => i && i.name)
        .slice(0, 500)
        .map((i) => ({ name: String(i.name).slice(0, 120), price: Number(i.price) || 0, cat: String(i.cat || "Lainnya").slice(0, 40) }));
      await store.setJSON("katalog", items);
    } else {
      return json({ ok: false, error: "aksi tidak dikenal" }, 400);
    }
    return json(await readAll(store));
  }

  return json({ ok: false, error: "method tidak didukung" }, 405);
};

export const config = { path: "/api/data" };
