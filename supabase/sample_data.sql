-- শুধু পরীক্ষার নকল ডেটা। আসল সিস্টেম চালুর আগে মুছে ফেলুন:
--   delete from public.applications where kobo_id < 0;
insert into public.applications
  (kobo_id, spot_code, spot_code_norm, volunteer_name, volunteer_mobile, volunteer_mobile_norm,
   district, upazila, beneficiary_name, father_name, beneficiary_mobile, union_name, village)
values
  (-1, 'SP-101', 'SP101', 'নকল স্বেচ্ছাসেবক', '01700000000', '01700000000', 'ঢাকা', 'সাভার', 'রহিমা বেগম', 'আব্দুল করিম', '01800000001', 'আমিনবাজার', 'কাঁচপুর'),
  (-2, 'SP-101', 'SP101', 'নকল স্বেচ্ছাসেবক', '01700000000', '01700000000', 'ঢাকা', 'সাভার', 'জমির উদ্দিন', 'হাসেম আলী', '01800000002', 'আমিনবাজার', 'ভাকুর্তা'),
  (-3, 'SP-101', 'SP101', 'নকল স্বেচ্ছাসেবক', '01700000000', '01700000000', 'ঢাকা', 'সাভার', 'সালমা খাতুন', 'ইদ্রিস মিয়া', '01800000003', 'বনগাঁও', 'বনগাঁও');
