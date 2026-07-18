/**
 * Payload for a `send-verification-email` job.
 *
 * We pass IDs + the email (the worker has no DB this step), NOT the whole User
 * entity: the payload is serialized to Redis and may run minutes later, so a
 * snapshotted User would be stale AND could leak sensitive columns
 * (passwordHash, refreshTokenHash). Small, explicit fields only.
 */
export interface SendVerificationEmailJob {
  userId: string;
  email: string;
  verificationToken: string;

  /**
   * The requestId of the HTTP request that enqueued this job. The worker restores
   * it into its logging context so the worker's log lines correlate back to the
   * originating signup request — end-to-end tracing across the async boundary.
   */
  requestId?: string;

  /**
   * Demo/testing hook ONLY: when true the processor always throws, so the job
   * exhausts its retries and lands in the DLQ — lets us exercise the
   * dead-letter path on demand. Never set by real signup.
   */
  forceFail?: boolean;
}
