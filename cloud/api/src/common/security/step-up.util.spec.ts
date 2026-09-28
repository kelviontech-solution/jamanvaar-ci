import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { requireStepUpPassword } from './step-up.util';

const actor = { id: 'u1', passwordHash: bcrypt.hashSync('correct-horse', 4) };

describe('requireStepUpPassword', () => {
  it("resolves when the password matches the actor's real hash", async () => {
    await expect(requireStepUpPassword(actor, 'correct-horse')).resolves.toBeUndefined();
  });

  it('throws ForbiddenException when the password is wrong', async () => {
    await expect(requireStepUpPassword(actor, 'wrong-password')).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when the password is missing', async () => {
    await expect(requireStepUpPassword(actor, undefined)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when the actor has no password hash set', async () => {
    await expect(requireStepUpPassword({ id: 'u2', passwordHash: null }, 'anything')).rejects.toThrow(ForbiddenException);
  });
});
