import pool from '../db.js';

/**
 * One connection owns the Postgres session lock for the entire async cycle.
 * try-lock skips overlapping ticks, including ticks on another web replica.
 * Distinct keys let billing and print maintenance run independently.
 */
export async function withJobLock(key: number, run: () => Promise<void>): Promise<void> {
  const connection = await pool.connect();
  let locked = false;
  try {
    const result = await connection.query('SELECT pg_try_advisory_lock($1) AS locked', [key]);
    locked = result.rows[0]?.locked === true;
    if (!locked) return;
    await run();
  } finally {
    try {
      if (locked) await connection.query('SELECT pg_advisory_unlock($1)', [key]);
    } finally {
      connection.release();
    }
  }
}
