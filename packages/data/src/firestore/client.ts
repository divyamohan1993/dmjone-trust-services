/**
 * Firestore client factory. Honors the standard emulator + database selectors
 * so the same code runs against the local emulator (tests / dev) and the real
 * Native-mode database (production) with no branching at the call sites.
 *
 *   - FIRESTORE_EMULATOR_HOST  → the @google-cloud/firestore SDK reads this env
 *     var itself and routes to the emulator; we surface it in the type so the
 *     dependency is explicit and validated upstream by @dmjone/shared's env.
 *   - FIRESTORE_DATABASE_ID    → which named database (default `(default)`).
 *   - GCP_PROJECT_ID           → project for credentials + addressing.
 *
 * `ignoreUndefinedProperties: true` is REQUIRED: Firestore throws on an
 * `undefined` field value, and our domain types carry optional fields
 * (revokedAt, lockedUntil, anchor.github, …). With this flag, absent optionals
 * are simply not written; on read-back we omit the key entirely (never assign
 * `= undefined`) to satisfy exactOptionalPropertyTypes.
 */

import { Firestore, type Settings } from '@google-cloud/firestore';

/** The subset of the validated app env this layer needs. */
export interface FirestoreEnv {
  GCP_PROJECT_ID: string;
  FIRESTORE_DATABASE_ID: string;
  FIRESTORE_EMULATOR_HOST?: string | undefined;
}

/**
 * Construct a Firestore client. When `FIRESTORE_EMULATOR_HOST` is set, the SDK
 * connects to the emulator automatically; we still pass projectId/databaseId so
 * the emulator addresses the right (named) database.
 */
export function createFirestore(env: FirestoreEnv): Firestore {
  const settings: Settings = {
    projectId: env.GCP_PROJECT_ID,
    databaseId: env.FIRESTORE_DATABASE_ID,
    ignoreUndefinedProperties: true,
  };
  return new Firestore(settings);
}
