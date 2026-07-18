/**
 * UserRole
 * ────────
 * The *vocabulary* of roles a Cashroom user can hold. This list lives in code
 * (cheap to extend); which role a given user has lives in the `users.role`
 * column (per-user data). Together they form the basis of RBAC: permissions
 * attach to a role, and a user gains them by holding that role.
 *
 * Stored in the DB as its string value ('student' | 'admin'), guarded by a
 * CHECK constraint. Adding a new role type later is a one-line edit here plus a
 * small migration that widens the CHECK.
 *
 * Imported by future auth guards — keep it framework-free.
 */
export enum UserRole {
  STUDENT = 'student',
  ADMIN = 'admin',
}
