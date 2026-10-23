// Kobo API থেকে আবেদন টেনে এনে Supabase-এ আপসার্ট করে (ব্যাকআপ/প্রথমবারের ডেটা লোড)।
// GitHub Actions প্রতি ৩০ মিনিটে এটি কল করে। সময় শেষ হয়ে গেলে `next` ফেরত দেয়, কলার সেটা আবার পাঠায়।
import { toRow } from "../_shared/fields.ts";
import { adminClient, json, safeEqual } from "../_shared/util.ts";

const TIME_BUDGET_MS = 100_000;
const CHUNK = 500;

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

  const deadline = Date.now() + TIME_BUDGET_MS;
  let synced = 0;

  while (next) {
    const res = await fetch(next, { headers: { Authorization: `Token ${token}` } });
    if (!res.ok) return json({ error: `kobo ${res.status}`, synced }, 502);
    const page = await res.json();

    const rows = (page.results ?? []).map(toRow).filter((r: unknown) => r !== null);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await db
        .from("applications")
        .upsert(rows.slice(i, i + CHUNK), { onConflict: "kobo_id" });
      if (error) return json({ error: "db error: " + error.message, synced }, 500);
    }
    synced += rows.length;
    next = page.next ?? null;

    if (next && Date.now() > deadline) return json({ done: false, next, synced });
  }
  return json({ done: true, synced });
});
