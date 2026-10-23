// Kobo API থেকে আবেদন টেনে এনে Supabase-এ আপসার্ট করে (ব্যাকআপ/প্রথমবারের ডেটা লোড)।
// GitHub Actions প্রতি ৩০ মিনিটে এটি কল করে। সময় শেষ হয়ে গেলে `next` ফেরত দেয়, কলার সেটা আবার পাঠায়।
//
// `full: true` সিঙ্ক সফলভাবে শেষ হলে, Kobo-তে যে আবেদন আর নেই সেগুলো এখান থেকেও মুছে ফেলে:
// পুরো সিঙ্কে যেসব সারি ছোঁয়া হয়েছে তাদের synced_at >= run_start, বাকিগুলো Kobo-তে নেই।
import { toRow } from "../_shared/fields.ts";
import { adminClient, json, safeEqual } from "../_shared/util.ts";

const TIME_BUDGET_MS = 100_000;
const CHUNK = 500;
const MAX_DELETE_RATIO = 0.2; // একবারে ২০%-এর বেশি মুছতে হলে থেমে যায় (ভুল ডেটা পেলে সুরক্ষা)
const MIN_ROWS_FOR_RATIO = 50;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = req.headers.get("x-sync-secret") ?? "";
  if (!safeEqual(secret, Deno.env.get("SYNC_SECRET") ?? "")) {
    return json({ error: "unauthorized" }, 401);
  }

  const server = new URL(Deno.env.get("KOBO_SERVER") ?? "https://kf.kobotoolbox.org");
  const uid = Deno.env.get("KOBO_ASSET_UID");
  const token = Deno.env.get("KOBO_TOKEN");
  if (!uid || !token) return json({ error: "KOBO_ASSET_UID / KOBO_TOKEN not set" }, 500);

  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  // শুরুর URL: cursor থাকলে সেটা (শুধু Kobo হোস্টের), নইলে নতুন
  let next: string | null;
  if (typeof body.cursor === "string" && body.cursor) {
    const u = new URL(body.cursor);
    if (u.host !== server.host) return json({ error: "bad cursor" }, 400); // টোকেন অন্য হোস্টে যাওয়া ঠেকাতে
    u.protocol = server.protocol;
    next = u.toString();
  } else {
    const u = new URL(`/api/v2/assets/${uid}/data/`, server);
    u.searchParams.set("format", "json");
    u.searchParams.set("limit", "1000");
    if (!body.full) {
      const { data } = await db
        .from("applications")
        .select("submitted_at")
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(1);
      const latest = data?.[0]?.submitted_at;
      if (latest) {
        const since = new Date(new Date(latest).getTime() - 2 * 86400_000).toISOString();
        u.searchParams.set("query", JSON.stringify({ _submission_time: { $gt: since } }));
      }
    }
    next = u.toString();
  }

  // পুরো সিঙ্কের শুরুর সময়: প্রথম কলে এখন, পরের কলে কলার ফেরত পাঠায়
  let runStart: string | null = null;
  if (body.full) {
    const t = Date.parse(body.run_start ?? "");
    runStart = Number.isFinite(t) && Date.now() - t < 6 * 3600_000
      ? new Date(t).toISOString()
      : body.cursor ? null : new Date().toISOString(); // cursor আছে কিন্তু run_start নেই → মোছা বন্ধ
  }

  const deadline = Date.now() + TIME_BUDGET_MS;
  let synced = 0;
  let koboCount: number | null = null;

  while (next) {
    const res = await fetch(next, { headers: { Authorization: `Token ${token}` } });
    if (!res.ok) return json({ error: `kobo ${res.status}`, synced }, 502);
    const page = await res.json();
    if (typeof page.count === "number") koboCount = page.count;

    const rows = (page.results ?? []).map(toRow).filter((r: unknown) => r !== null);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await db
        .from("applications")
        .upsert(rows.slice(i, i + CHUNK), { onConflict: "kobo_id" });
      if (error) return json({ error: "db error: " + error.message, synced }, 500);
    }
    synced += rows.length;
    next = page.next ?? null;

    if (next && Date.now() > deadline) {
      return json({ done: false, next, synced, run_start: runStart });
    }
  }

  // সম্পূর্ণ সিঙ্ক শেষ: Kobo-তে নেই এমন আবেদন মুছুন
  if (!runStart) return json({ done: true, synced, deleted: 0 });

  const count = async (stale: boolean) => {
    const q = db.from("applications").select("kobo_id", { count: "exact", head: true });
    const { count: n, error } = stale ? await q.lt("synced_at", runStart) : await q.gte("synced_at", runStart);
    if (error) throw new Error(error.message);
    return n ?? 0;
  };
  try {
    const fresh = await count(false);
    const stale = await count(true);
    if (stale === 0) return json({ done: true, synced, deleted: 0 });

    // সুরক্ষা: Kobo থেকে সব আবেদন আসেনি, বা একবারে অনেকগুলো মুছতে হচ্ছে — কিছু মুছব না
    if (fresh === 0 || (koboCount !== null && fresh < koboCount * 0.99)) {
      return json({ done: true, synced, deleted: 0, skipped_delete: "Kobo-র সব আবেদন পাওয়া যায়নি", fresh, stale });
    }
    if (fresh + stale >= MIN_ROWS_FOR_RATIO && stale > (fresh + stale) * MAX_DELETE_RATIO) {
      return json({ done: true, synced, deleted: 0, skipped_delete: "একবারে অনেক বেশি মুছতে হচ্ছে", fresh, stale });
    }

    const { error } = await db.from("applications").delete().lt("synced_at", runStart);
    if (error) throw new Error(error.message);
    return json({ done: true, synced, deleted: stale });
  } catch (e) {
    return json({ done: true, synced, deleted: 0, error: String((e as Error).message) });
  }
});
