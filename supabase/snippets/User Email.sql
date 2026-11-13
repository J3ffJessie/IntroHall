 select email, raw_user_meta_data->>'full_name' as name
  from auth.users
  where email like 'demo-%@demo.test'
  order by created_at;