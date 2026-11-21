// D1's single-statement writes keep reservations, quotas and connection limits atomic.
export function d1Store(db) {
  const query = (sql, ...args) => db.prepare(sql).bind(...args);
  return {
    async listConnections(owner) {
      const rows = await query(
        'SELECT id,label,from_email AS fromEmail FROM email_connections WHERE owner_id=? ORDER BY label',
        owner,
      ).all();
      return rows.results;
    },
    getConnection(owner, id) {
      return query(
        'SELECT id,label,from_email AS fromEmail,encrypted_key AS encryptedKey FROM email_connections WHERE owner_id=? AND id=?',
        owner, id,
      ).first();
    },
    async addConnection(owner, { id, label, fromEmail, encryptedKey }) {
      const saved = await query(
        `INSERT INTO email_connections(id,owner_id,label,from_email,encrypted_key)
         SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM email_connections WHERE owner_id=?) < 10
         ON CONFLICT(owner_id,label) DO NOTHING`, id, owner, label, fromEmail, encryptedKey, owner,
      ).run();
      return saved.meta.changes === 1;
    },
    async deleteConnection(owner, id) {
      const removed = await query('DELETE FROM email_connections WHERE owner_id=? AND id=?', owner, id).run();
      return removed.meta.changes === 1;
    },
    async consumeBudget(owner, kind, bucket, limit) {
      const result = await query(
        `INSERT INTO email_send_budget(owner_id,kind,bucket,used) VALUES(?,?,?,1)
         ON CONFLICT(owner_id,kind) DO UPDATE SET bucket=excluded.bucket,
           used=CASE WHEN email_send_budget.bucket < excluded.bucket THEN 1 ELSE email_send_budget.used+1 END
         WHERE email_send_budget.bucket < excluded.bucket OR
           (email_send_budget.bucket=excluded.bucket AND email_send_budget.used < ?)`,
        owner, kind, bucket, limit,
      ).run();
      return result.meta.changes === 1;
    },
    getDelivery(owner, requestId) {
      return query(
        'SELECT digest,status,created_at AS createdAt FROM email_deliveries WHERE owner_id=? AND request_id=?',
        owner, requestId,
      ).first();
    },
    async reserveDelivery(owner, requestId, digest, timeMillis) {
      const row = await query(
        `INSERT INTO email_deliveries(owner_id,request_id,digest,status,created_at)
         VALUES(?,?,?,'sending',?) ON CONFLICT(owner_id,request_id) DO NOTHING`,
        owner, requestId, digest, timeMillis,
      ).run();
      return row.meta.changes === 1;
    },
    async retryRejectedDelivery(owner, requestId, previousTime, digest, timeMillis) {
      const row = await query(
        `UPDATE email_deliveries SET digest=?, status='sending', created_at=?
         WHERE owner_id=? AND request_id=? AND status='rejected' AND created_at=?`,
        digest, timeMillis, owner, requestId, previousTime,
      ).run();
      return row.meta.changes === 1;
    },
    async recordDelivery(owner, requestId, status, timeMillis) {
      const row = await query(
        "UPDATE email_deliveries SET status=? WHERE owner_id=? AND request_id=? AND status='sending' AND created_at=?",
        status, owner, requestId, timeMillis,
      ).run();
      if (row.meta.changes !== 1) throw new Error("Unable to record email result");
    },
  };
}
