-- আবেদনের টেবিল। সরাসরি পাবলিক অ্যাক্সেস নেই: শুধু Edge Function (service_role) পড়তে/লিখতে পারে।
create table public.applications (
  kobo_id               bigint primary key,          -- Kobo-র _id (এডিট করলেও বদলায় না)
  submitted_at          timestamptz,
  spot_code             text,
  spot_code_norm        text not null default '',    -- ইংরেজি অঙ্ক, বড় হাতের, স্পেস/হাইফেন ছাড়া
  volunteer_name        text,
  volunteer_mobile      text,
  volunteer_mobile_norm text not null default '',    -- 01XXXXXXXXX
  district              text,
  upazila               text,
  beneficiary_name      text,
  father_name           text,
  beneficiary_mobile    text,
  union_name            text,
  village               text,
  raw                   jsonb,
  synced_at             timestamptz not null default now()
);

create index applications_lookup_idx
  on public.applications (spot_code_norm, volunteer_mobile_norm);

-- ভুল চেষ্টা সীমিত করার জন্য
create table public.lookup_attempts (
  id  bigint generated always as identity primary key,
  ip  text not null,
  ok  boolean not null,
  at  timestamptz not null default now()
);
create index lookup_attempts_ip_at_idx on public.lookup_attempts (ip, at);

alter table public.applications   enable row level security;
alter table public.lookup_attempts enable row level security;
-- কোনো policy নেই = anon/authenticated কিছুই পড়তে পারবে না
revoke all on public.applications    from anon, authenticated;
revoke all on public.lookup_attempts from anon, authenticated;
