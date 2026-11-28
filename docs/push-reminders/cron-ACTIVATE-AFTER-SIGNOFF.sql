-- DO NOT RUN until physical-device and staging sign-off. Use a dedicated high-entropy
-- cron secret in both Edge Function secrets and Vault; never store it in source code.
-- In Supabase enable pg_cron, pg_net and Vault through the dashboard first.
-- Vault secret names: bt_push_function_url (full /functions/v1/hour-reminders URL)
-- and bt_push_cron_secret (same value as BT_PUSH_CRON_SECRET).
-- Run as privileged database operator. No public function exposes Vault contents.
SELECT cron.schedule('buildtrack-hour-reminders-v1','*/5 * * * *',$job$
 SELECT net.http_post(
   url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='bt_push_function_url'),
   headers := jsonb_build_object('Content-Type','application/json','x-buildtrack-cron',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='bt_push_cron_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 60000
 );
$job$);
-- Stop: SELECT cron.unschedule('buildtrack-hour-reminders-v1');
