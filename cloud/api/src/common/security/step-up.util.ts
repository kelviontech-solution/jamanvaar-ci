import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

/**
 * A handful of payment actions (approving/suspending/disconnecting a
 * restaurant's Razorpay connection, changing platform or per-restaurant
 * commission) require the acting platform user to re-enter their own
 * password, on top of the RBAC check PlatformAuthGuard already performed.
 * Reuses the same bcrypt comparison platform-auth.service.ts's login flow
 * already uses -- no new credential mechanism.
 */
export async function requireStepUpPassword(
  actor: { id: string; passwordHash: string | null },
  password: string | undefined
): Promise<void> {
  if (!password || !actor.passwordHash || !(await bcrypt.compare(password, actor.passwordHash))) {
    throw new ForbiddenException('Re-enter your password to confirm this action');
  }
}
