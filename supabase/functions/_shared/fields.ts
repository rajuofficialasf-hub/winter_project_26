import { normMobile, normSpot } from "./normalize.ts";

/**
 * এখানে বাম পাশের নামগুলো টেবিলের কলাম, ডান পাশের তালিকায় Kobo ফর্মের
 * ফিল্ডের নাম (XLSForm-এর `name` কলাম) বসান। একাধিক নাম দিলে প্রথম যেটা পাওয়া যায় সেটা নেবে।
 * ফিল্ড গ্রুপের ভেতরে থাকলেও (group/field) শুধু `field` লিখলেই চলবে।
 */
export const FIELD_MAP = {
  spot_code: ["spot_code"],
  volunteer_name: ["volunteer_name"],
  volunteer_mobile: ["volunteer_mobile"],
  district: ["district"],
  upazila: ["upazila"],
  beneficiary_name: ["B_name"],
  father_name: ["gurdian_name"],
  beneficiary_mobile: ["mobile"],
  union_name: ["union"],
  village: ["village"],
} as const;

type Submission = Record<string, unknown>;

function pick(sub: Submission, names: readonly string[]): string | null {
  for (const n of names) {
    let v = sub[n];
    if (v === undefined) {
      const key = Object.keys(sub).find((k) => k.endsWith("/" + n));
      if (key) v = sub[key];
    }
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return null;
}

function parseTime(v: unknown): string | null {
  if (!v) return null;
  let s = String(v);
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z"; // Kobo-র সময় UTC
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Kobo সাবমিশন → টেবিলের সারি। _id না থাকলে null */
export function toRow(sub: Submission) {
  const koboId = Number(sub._id);
  if (!Number.isFinite(koboId)) return null;

  const f = Object.fromEntries(
    Object.entries(FIELD_MAP).map(([col, names]) => [col, pick(sub, names)]),
  ) as Record<keyof typeof FIELD_MAP, string | null>;

  return {
    kobo_id: koboId,
    submitted_at: parseTime(sub._submission_time),
    ...f,
    spot_code_norm: normSpot(f.spot_code),
    volunteer_mobile_norm: normMobile(f.volunteer_mobile),
    raw: sub,
    synced_at: new Date().toISOString(),
  };
}
