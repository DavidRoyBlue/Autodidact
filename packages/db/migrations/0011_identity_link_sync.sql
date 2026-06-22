-- 0011_identity_link_sync.sql
-- Social sign-in Phase 2 (Spec 2 / D5) — defensive sync when an identity is LINKED.
-- The column-scoped sync_user_from_auth trigger (0007) fires only on UPDATE OF email,is_anonymous
-- on auth.users. If linkIdentity (guest links Google/Facebook) writes auth.identities WITHOUT
-- touching those auth.users columns, public.users would go stale. This idempotent AFTER INSERT
-- trigger on auth.identities closes that gap (belt-and-suspenders with 0007; harmless if redundant).
CREATE OR REPLACE FUNCTION public.handle_identity_linked()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    UPDATE public.users
       SET email        = COALESCE(NEW.identity_data ->> 'email', public.users.email),
           is_anonymous = false,
           updated_at   = now()
     WHERE id = NEW.user_id;
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS on_auth_identity_linked ON auth.identities;
CREATE TRIGGER on_auth_identity_linked
  AFTER INSERT ON auth.identities
  FOR EACH ROW EXECUTE FUNCTION public.handle_identity_linked();

-- Defense-in-depth (mirrors 0008): the SECURITY DEFINER fn must not be RPC-callable by clients.
REVOKE EXECUTE ON FUNCTION public.handle_identity_linked() FROM PUBLIC, anon, authenticated;
