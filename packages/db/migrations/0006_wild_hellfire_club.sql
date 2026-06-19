ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "module_progress" DROP CONSTRAINT "module_progress_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
