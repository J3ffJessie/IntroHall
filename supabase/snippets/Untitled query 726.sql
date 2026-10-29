 insert into public.platform_admins (user_id)
  select id from auth.users where email = 'test@dev.com';