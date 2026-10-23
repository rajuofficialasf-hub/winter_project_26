const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

export function toEnDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

/** যেকোনো ফরম্যাট (+8801…, ০১৭…, 1712…) থেকে 01XXXXXXXXX */
export function normMobile(v: unknown): string {
  let s = toEnDigits(String(v ?? "")).replace(/\D/g, "");
  if (s.startsWith("00")) s = s.slice(2);
  if (s.startsWith("880")) s = s.slice(2);
  if (s.length === 10 && s.startsWith("1")) s = "0" + s;
  return s;
}

export function isValidMobile(m: string): boolean {
  return /^01\d{9}$/.test(m);
}

/** স্পেস, হাইফেন, আন্ডারস্কোর বাদ; বড় হাতের; বাংলা অঙ্ক → ইংরেজি */
export function normSpot(v: unknown): string {
  return toEnDigits(String(v ?? "")).replace(/[\s\-_]/g, "").toUpperCase();
}
