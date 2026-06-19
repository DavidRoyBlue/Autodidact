-- Hybrid provisioning (Spec 2, D2'/D6/D7). All SECURITY DEFINER functions are
-- hardened: SET search_path = '' + fully schema-qualified names.
-- Idempotent: safe to re-apply (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).

-- is_anonymous() RLS helper (D7) — belt-and-suspenders; app reads the column.
CREATE OR REPLACE FUNCTION public.is_anonymous()
  RETURNS boolean LANGUAGE sql STABLE
  SET search_path = ''
  AS $$ SELECT COALESCE((auth.jwt() -> 'is_anonymous')::boolean, false) $$;

-- handle_new_user: provision public.users for every new auth.users row.
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    INSERT INTO public.users (id, supabase_id, email, is_anonymous)
    VALUES (NEW.id, NEW.id, NEW.email, COALESCE(NEW.is_anonymous, false))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- sync_user_from_auth: keep email/is_anonymous in sync on anon→real upgrade
-- (an UPDATE of auth.users, not an INSERT — the insert trigger won't fire).
CREATE OR REPLACE FUNCTION public.sync_user_from_auth()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    UPDATE public.users
       SET email = NEW.email,
           is_anonymous = COALESCE(NEW.is_anonymous, false),
           updated_at = now()
     WHERE id = NEW.id;
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email, is_anonymous ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_from_auth();
