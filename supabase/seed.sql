-- Local development only (runs on `supabase db reset`). Production sets these by hand:
--   insert into private.secrets values ('push_worker_url', 'https://<project>.supabase.co/functions/v1/send-push'), …
-- The service-role key below is the well-known local demo key, not a secret.
insert into private.secrets (key, value) values
  ('push_worker_url', 'http://kong:8000/functions/v1/send-push'),
  ('service_role_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU')
on conflict (key) do update set value = excluded.value;
