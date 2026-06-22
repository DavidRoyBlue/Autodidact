-- 0012_identity_link_guard.sql
-- Tighten the 0011 identity-link sync trigger: act ONLY on the actual guest→real upgrade.
-- 0011's handle_identity_linked() ran on every auth.identities INSERT and unconditionally set
-- is_anonymous=false. That is redundant for normal signups (the row is already non-anonymous via
-- handle_new_user) and — worse — would overwrite a real user's email if they later link a SECOND
-- identity. Adding `AND public.users.is_anonymous = true` scopes the sync precisely to the anon→real
-- conversion (the only case this defensive trigger exists for). CREATE OR REPLACE — no trigger change.
CREATE OR REPLACE FUNCTION public.handle_identity_linked()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    UPDATE public.users
       SET email        = COALESCE(NEW.identity_data ->> 'email', public.users.email),
           is_anonymous = false,
           updated_at   = now()
     WHERE id = NEW.user_id
       AND public.users.is_anonymous = true;
    RETURN NEW;
  END;
  $$;

-- Re-assert the grant lockdown (REVOKE is idempotent; keeps the SECURITY DEFINER fn non-RPC-callable).
REVOKE EXECUTE ON FUNCTION public.handle_identity_linked() FROM PUBLIC, anon, authenticated;
