import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { getDb, users, eq } from '@autodidact/db';

@Injectable()
export class ProvisioningService {
  // Existence assertion only — the DB trigger (handle_new_user) provisions the
  // row. A missing row means the trigger failed; surface a loud 500, never
  // self-heal (Spec 2, 1c). This is the seam Spec 3 extends with onboarding.
  async ensureProvisioned(userId: string): Promise<void> {
    const db = getDb();
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (rows.length === 0) {
      throw new InternalServerErrorException(
        `User ${userId} is not provisioned — the handle_new_user trigger did not run. Fix the trigger; do not self-heal.`,
      );
    }
  }
}
