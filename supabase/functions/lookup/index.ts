// স্বেচ্ছাসেবকের স্পটকোড + মোবাইল মিললে শুধু তার নিজের আবেদনগুলো ফেরত দেয়।
import { isValidMobile, normMobile, normSpot } from "../_shared/normalize.ts";
import { adminClient, json } from "../_shared/util.ts";

const MAX_FAILS = 10;          // প্রতি IP, ১৫ মিনিটে ভুল চেষ্টার সীমা
const WINDOW_MS = 15 * 60_000;
const PAGE = 1000;
const MAX_ROWS = 5000;

const cors = {
  "access-control-allow-origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "access-control-allow-headers": "content-type, authorization, apikey",
  "access-control-allow-methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => json(body, status, cors);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const spot = normSpot(body.spot_code);
  const mobile = normMobile(body.mobile);
  if (!spot || spot.length > 40 || !isValidMobile(mobile)) {
    return reply({ error: "স্পট কোড ও ১১ ডিজিটের মোবাইল নম্বর সঠিকভাবে দিন।" }, 400);
  }

  const db = adminClient();
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();

  const { count: fails } = await db
    .from("lookup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip).eq("ok", false)
    .gt("at", new Date(Date.now() - WINDOW_MS).toISOString());
  if ((fails ?? 0) >= MAX_FAILS) {
    return reply({ error: "অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।" }, 429);
  }

  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db
      .from("applications")
      .select(
        "volunteer_name, volunteer_mobile, spot_code, district, upazila, " +
          "beneficiary_name, father_name, beneficiary_mobile, union_name, village",
      )
      .eq("spot_code_norm", spot)
      .eq("volunteer_mobile_norm", mobile)
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .order("kobo_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("lookup failed", error.message);
      return reply({ error: "সার্ভারে সমস্যা হয়েছে, একটু পরে চেষ্টা করুন।" }, 500);
    }
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const ok = rows.length > 0;
  await db.from("lookup_attempts").insert({ ip, ok });
  if (Math.random() < 0.01) {
    await db.from("lookup_attempts").delete().lt("at", new Date(Date.now() - 86400_000).toISOString());
  }

  if (!ok) return reply({ error: "এই স্পট কোড ও মোবাইল নম্বরে কোনো আবেদন পাওয়া যায়নি।" }, 404);

  const first = rows[0] as Record<string, string>;
  return reply({
    volunteer: {
      name: first.volunteer_name,
      mobile, // নরমালাইজ করা (01XXXXXXXXX), কারণ Kobo-তে শুরুর ০ বাদ পড়ে
      spot_code: first.spot_code,
      district: first.district,
      upazila: first.upazila,
    },
    total: rows.length,
    rows: rows.map((r) => ({
      name: r.beneficiary_name,
      father: r.father_name,
      mobile: r.beneficiary_mobile,
      union: r.union_name,
      village: r.village,
    })),
  });
});
