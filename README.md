# শীতবস্ত্র প্রকল্প – আবেদন দেখার সিস্টেম

```
Kobo ──(REST Service, প্রতিটি আবেদনে)──▶ kobo-webhook ─┐
Kobo ──(GitHub Actions, ৩০ মিনিটে)────▶ kobo-sync ─────┼▶ Supabase DB (applications)
স্বেচ্ছাসেবক ▶ GitHub Pages (web/) ▶ lookup ───────────┘      (RLS: সরাসরি অ্যাক্সেস বন্ধ)
```

স্বেচ্ছাসেবক স্পট কোড + মোবাইল দিলে, ওই দুটো মিলে যাওয়া আবেদনগুলোই শুধু দেখতে পায়।

## ১. Kobo ফর্মের ফিল্ডের নাম মেলান
[supabase/functions/_shared/fields.ts](supabase/functions/_shared/fields.ts) খুলে `FIELD_MAP`-এ আপনার XLSForm-এর `name` কলামের নামগুলো বসান।

> Kobo API `select_one` ফিল্ডে লেবেল নয়, **ভ্যালু** (যেমন `dhaka`) পাঠায়। জেলা/উপজেলা/ইউনিয়ন এমন হলে
> বাংলা নাম দেখাতে চাইলে ফর্মের choice-এর `name`-ই বাংলায় রাখুন, অথবা আমাকে বলুন, ম্যাপিং যোগ করে দেব।

## ২. Supabase
```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push                       # টেবিল তৈরি
```

গোপন মান তৈরি (দুটো আলাদা):
```bash
openssl rand -hex 24   # WEBHOOK_SECRET
openssl rand -hex 24   # SYNC_SECRET
```
```bash
supabase secrets set WEBHOOK_SECRET=... SYNC_SECRET=... \
  KOBO_TOKEN=<Kobo → Account Settings → Security → API Key> \
  KOBO_ASSET_UID=<ফর্মের URL-এর শেষের কোড, যেমন aBcD1234> \
  KOBO_SERVER=https://kf.kobotoolbox.org
```
ডিপ্লয়:
```bash
supabase functions deploy lookup --no-verify-jwt
supabase functions deploy kobo-webhook --no-verify-jwt
supabase functions deploy kobo-sync --no-verify-jwt
```

## ৩. Kobo-তে ওয়েবহুক
ফর্ম → **Settings → REST Services → Register a New Service**
- Endpoint URL: `https://<PROJECT_REF>.supabase.co/functions/v1/kobo-webhook`
- Type: JSON
- Advanced → Custom HTTP Headers: নাম `x-webhook-secret`, মান = আপনার `WEBHOOK_SECRET`

## ৪. GitHub
1. রেপো বানিয়ে এই ফোল্ডারটি push করুন।
2. `web/config.js`-এ `YOUR-PROJECT-REF` বদলান।
3. Settings → Pages → Source: **GitHub Actions**।
4. Settings → Secrets and variables → Actions:
   - `SUPABASE_URL` = `https://<PROJECT_REF>.supabase.co`
   - `SYNC_SECRET` = উপরের `SYNC_SECRET`
5. Actions → **Kobo → Supabase sync** → Run workflow → `full` টিক দিয়ে চালান। এতে আগের সব আবেদন লোড হবে।

## ৫. পরীক্ষা
[supabase/sample_data.sql](supabase/sample_data.sql) SQL Editor-এ চালিয়ে স্পট কোড `SP-101`, মোবাইল `01700000000` দিয়ে দেখুন।
তারপর মুছুন: `delete from public.applications where kobo_id < 0;`

## নিরাপত্তা
- `applications` টেবিলে RLS চালু ও কোনো policy নেই। ব্রাউজার থেকে সরাসরি পড়া যায় না।
- `lookup` শুধু ১০টি কলাম ফেরত দেয়। `raw` ডেটা বা NID/ঠিকানা কখনো বেরোয় না।
- প্রতি IP-তে ১৫ মিনিটে ১০টি ভুল চেষ্টার পর ব্লক।
- service_role key, Kobo token, secrets কখনো গিটে বা চ্যাটে দেবেন না।
- স্পট কোড ও মোবাইল আন্দাজ করা সম্ভব, তাই চাইলে ফর্মে একটি PIN ফিল্ড যোগ করে সেটাও মেলানো যায়।

## জানা সীমাবদ্ধতা
- Kobo-তে সাবমিশন মুছলে Supabase থেকে নিজে থেকে মুছবে না।
- `kobo-sync` ছোট ব্যাচে চলে। প্রথম `full` সিঙ্কে ৩০,০০০ আবেদন কয়েক ধাপে লোড হয়, এটা স্বাভাবিক।
