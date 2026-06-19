import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';

const mockSelect = vi.fn();
vi.mock('@autodidact/db', () => ({
  getDb: () => ({ select: mockSelect }),
  users: { id: 'id' },
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

import { ProvisioningService } from '../modules/provisioning/provisioning.service.js';

describe('ProvisioningService.ensureProvisioned', () => {
  beforeEach(() => mockSelect.mockReset());

  it('resolves when the user row exists', async () => {
    mockSelect.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ id: 'u1' }] }) }) });
    await expect(new ProvisioningService().ensureProvisioned('u1')).resolves.toBeUndefined();
  });

  it('throws a loud 500 when the row is missing (trigger failure, no self-heal)', async () => {
    mockSelect.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
    await expect(new ProvisioningService().ensureProvisioned('missing')).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
