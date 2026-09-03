import type { PlatformUser } from "../../shared/schemas.js";
import type { PlatformIdentity, PlatformUserRepository } from "../data/platform-user-repository.js";
import { accountSuspended } from "../errors.js";
import type { AuthenticatedPrincipal } from "../types.js";

const LAST_SEEN_THROTTLE_MS = 15 * 60 * 1_000;

function identityFromPrincipal(principal: AuthenticatedPrincipal): PlatformIdentity {
  return {
    uid: principal.uid,
    email: principal.email ?? null,
    displayName: principal.displayName ?? null,
    providerId: principal.signInProvider ?? null,
    emailVerified: principal.emailVerified,
  };
}

function identityOutOfDate(user: PlatformUser, identity: PlatformIdentity): boolean {
  return (
    user.email !== identity.email ||
    user.displayName !== identity.displayName ||
    user.emailVerified !== identity.emailVerified ||
    (identity.providerId !== null && !user.providerIds.includes(identity.providerId))
  );
}

export class PlatformUserService {
  constructor(
    private readonly repository: PlatformUserRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolveActiveUser(principal: AuthenticatedPrincipal): Promise<PlatformUser> {
    const identity = identityFromPrincipal(principal);
    let user = await this.repository.getOrCreate(identity);

    if (user.status !== "active") {
      throw accountSuspended();
    }

    if (identityOutOfDate(user, identity)) {
      user = await this.repository.refreshIdentity(principal.uid, identity);
    }

    if (this.now().getTime() - Date.parse(user.lastSeenWriteAt) >= LAST_SEEN_THROTTLE_MS) {
      user = await this.repository.touchLastSeen(principal.uid);
    }

    return user;
  }
}
