import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import type { Db } from '../../infrastructure/database/database.js';
import { DATABASE } from '../../infrastructure/database/database.module.js';
import type { VerifiedIdentity } from './identity-verifier.js';

export type AccountKind = 'owner' | 'operator';

/** The authenticated caller, attached to the request by OwnerGuard / OperatorGuard. */
export type Principal = { readonly kind: AccountKind; readonly accountId: string };

declare module 'express' {
  interface Request {
    principal?: Principal;
  }
}

@Injectable()
export class AccountService {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  /** Maps a verified identity to an existing platform account of the given kind (D-025). */
  async findAccount(identity: VerifiedIdentity, kind: AccountKind): Promise<string | undefined> {
    const { rows } = await sql<{ id: string | null }>`
      SELECT app.find_account(${identity.issuer}, ${identity.subject}, ${kind}) AS id
    `.execute(this.db);
    return rows[0]?.id ?? undefined;
  }
}
