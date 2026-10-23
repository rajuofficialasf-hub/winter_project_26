// Kobo → REST Services এই ফাংশনকে প্রতিটি নতুন/এডিট করা সাবমিশনে কল করে।
import { toRow } from "../_shared/fields.ts";
import { adminClient, json, safeEqual } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = new URL(req.url);
  const secret = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
  if (!safeEqual(secret, Deno.env.get("WEBHOOK_SECRET") ?? "")) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const subs = (Array.isArray(body) ? body : [body]) as Record<string, unknown>[];
  const rows = subs.map(toRow).filter((r) => r !== null);
  if (rows.length === 0) return json({ error: "no valid submission (_id missing)" }, 400);

  const { error } = await adminClient()
    .from("applications")
    .upsert(rows, { onConflict: "kobo_id" });

  // ৫xx দিলে Kobo পরে আবার চেষ্টা করবে
  if (error) {
    console.error("upsert failed", error.message);
    return json({ error: "db error" }, 500);
  }
  return json({ ok: true, count: rows.length });
});
