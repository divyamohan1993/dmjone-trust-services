/**
 * @dmjone/shared — the locked contract every stream builds against.
 *
 * Types describe data at rest; contracts describe the seams between streams;
 * schemas validate inputs; env validates configuration; constants and errors
 * are cross-cutting. Nothing here performs I/O.
 */

export * from './constants.js';
export * from './errors.js';
export * from './types.js';
export * from './contracts.js';
export * from './canonical.js';
export * from './schemas.js';
export * from './env.js';
