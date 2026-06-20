-- Harden the provisioning trigger functions (follow-up to 0007).
-- handle_new_user / sync_user_from_auth are SECURITY DEFINER. By default PUBLIC
-- (and Supabase's anon/authenticated) hold EXECUTE, which the security advisor
-- flags (0028/0029) as "anon/authenticated can call a SECURITY DEFINER function
-- via /rest/v1/rpc/...". They RETURN trigger, so Postgres refuses to invoke them
-- outside a trigger anyway — but revoking EXECUTE removes the grant, clears the
-- advisor, and is defense-in-depth. Trigger firing is unaffected (it runs with
-- the table owner's context, not via EXECUTE grants).
-- (Plan C's Data API lockdown broadens this to all functions; this is the
-- targeted fix for the two functions 0007 introduced.)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_user_from_auth() FROM PUBLIC, anon, authenticated;
