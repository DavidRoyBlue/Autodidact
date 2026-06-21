-- 0010_policy_hardening.sql
-- Spec 2 Phase 3 / D4' — drop deprecated auth.role(); scope every app-table policy TO authenticated.
-- Predicates are preserved verbatim (the 0004 performance-optimized form); only role scope changes.
-- Anonymous users carry role=authenticated, so TO authenticated correctly INCLUDES guests (D5).

-- users ---------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated USING (supabase_id = (SELECT auth.uid()));
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated USING (supabase_id = (SELECT auth.uid()));

-- courses (drop the auth.role() predicate; role scoping is now structural) ----
DROP POLICY IF EXISTS "courses_select_public" ON public.courses;
CREATE POLICY "courses_select_public" ON public.courses
  FOR SELECT TO authenticated USING (is_public = TRUE);

-- modules -------------------------------------------------------------------
DROP POLICY IF EXISTS "modules_select_public_course" ON public.modules;
CREATE POLICY "modules_select_public_course" ON public.modules
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses
            WHERE courses.id = modules.course_id AND courses.is_public = TRUE));

-- enrollments ---------------------------------------------------------------
DROP POLICY IF EXISTS "enrollments_select_own" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_insert_own" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_update_own" ON public.enrollments;
CREATE POLICY "enrollments_select_own" ON public.enrollments
  FOR SELECT TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "enrollments_insert_own" ON public.enrollments
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "enrollments_update_own" ON public.enrollments
  FOR UPDATE TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));

-- module_progress -----------------------------------------------------------
DROP POLICY IF EXISTS "module_progress_select_own" ON public.module_progress;
DROP POLICY IF EXISTS "module_progress_insert_own" ON public.module_progress;
DROP POLICY IF EXISTS "module_progress_update_own" ON public.module_progress;
CREATE POLICY "module_progress_select_own" ON public.module_progress
  FOR SELECT TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "module_progress_insert_own" ON public.module_progress
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "module_progress_update_own" ON public.module_progress
  FOR UPDATE TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));

-- chat_sessions -------------------------------------------------------------
DROP POLICY IF EXISTS "chat_sessions_select_own" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_insert_own" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_update_own" ON public.chat_sessions;
CREATE POLICY "chat_sessions_select_own" ON public.chat_sessions
  FOR SELECT TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "chat_sessions_insert_own" ON public.chat_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "chat_sessions_update_own" ON public.chat_sessions
  FOR UPDATE TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
