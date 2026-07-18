/**
 * InterestMethod
 * ──────────────
 * How interest is computed on a loan.
 *
 * Only REDUCING exists today (interest accrues on the *outstanding* principal —
 * the fair, standard method for EMIs). We still model it as a column + enum so
 * that adding FLAT later is a cheap CHECK-widening migration (exactly like
 * adding a new UserRole), not a schema redesign. See the "things to question"
 * note in learning/06 — this is the forward-compat vs YAGNI trade-off, chosen
 * deliberately.
 *
 * Stored as varchar + DB CHECK constraint.
 */
export enum InterestMethod {
  REDUCING = 'reducing',
}
