/**
 * Ledger: one row per program run, stored in the agent's SQLite.
 *
 *   ledger
 *   +----+------------+--------------+-------------+------------------+-------------+-----------+------------+-------+
 *   | id | created_at | facade_calls | round_trips | isolate_start_ms | duration_ms | tokens_in | tokens_out | error |
 *   +----+------------+--------------+-------------+------------------+-------------+-----------+------------+-------+
 *   plus program (the code that ran) and result_json (truncated).
 *
 *   facade_calls      RPC calls the program made to the gate (counted on the host, services/gate-meter.ts)
 *   round_trips       model calls that produced this program: always 1, one program per model turn
 *   isolate_start_ms  the start of the run to the first facade call
 *   tokens_in/out     from the AI SDK step usage, attached after the step ends (null until then)
 */
import type { SandboxOutcome } from "mittens_sandbox";

/** One program run: what the sandbox reported, plus the program text and the time the host measured. */
export type ProgramRun = SandboxOutcome & { code: string; durationMs: number };

/** One program is produced by exactly one model round trip. The comparison is with N tool calls. */
export const ROUND_TRIPS_PER_PROGRAM = 1;
const DEFAULT_LIST_LIMIT = 20;
const MAX_RESULT_CHARS = 4000;

export type LedgerRow = {
  id: number;
  createdAt: string;
  program: string;
  resultJson: string | null;
  error: string | null;
  facadeCalls: number;
  roundTrips: number;
  isolateStartMs: number | null;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
};

export type TokenUsage = { inputTokens?: number; outputTokens?: number };

export class Ledger {
  readonly #sql: SqlStorage;

  constructor(sql: SqlStorage) {
    this.#sql = sql;
    this.#sql.exec(`CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      program TEXT NOT NULL,
      result_json TEXT,
      error TEXT,
      facade_calls INTEGER NOT NULL,
      round_trips INTEGER NOT NULL,
      isolate_start_ms INTEGER,
      duration_ms INTEGER NOT NULL,
      tokens_in INTEGER,
      tokens_out INTEGER
    )`);
  }

  /** Stores one run. Tokens are unknown at this point; see attachUsage. */
  recordRun(run: ProgramRun): LedgerRow {
    const inserted = this.#sql
      .exec(
        `INSERT INTO ledger (created_at, program, result_json, error, facade_calls, round_trips, isolate_start_ms, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        new Date().toISOString(),
        run.code,
        truncateJson(run.result),
        run.error,
        run.facadeCalls,
        ROUND_TRIPS_PER_PROGRAM,
        run.isolateStartMs,
        run.durationMs
      )
      .one();

    const row = this.get(Number(inserted.id));

    if (row === null) {
      throw new Error("Ledger insert did not return a row");
    }

    return row;
  }

  /** Adds the model usage of the step that produced the program. */
  attachUsage(id: number, usage: TokenUsage): void {
    this.#sql.exec(`UPDATE ledger SET tokens_in = ?, tokens_out = ? WHERE id = ?`, usage.inputTokens ?? null, usage.outputTokens ?? null, id);
  }

  get(id: number): LedgerRow | null {
    const rows = this.#sql.exec(`SELECT * FROM ledger WHERE id = ?`, id).toArray();
    return rows.length === 0 ? null : toRow(rows[0]);
  }

  latest(): LedgerRow | null {
    const rows = this.#sql.exec(`SELECT * FROM ledger ORDER BY id DESC LIMIT 1`).toArray();
    return rows.length === 0 ? null : toRow(rows[0]);
  }

  list(limit: number = DEFAULT_LIST_LIMIT): LedgerRow[] {
    return this.#sql.exec(`SELECT * FROM ledger ORDER BY id DESC LIMIT ?`, limit).toArray().map(toRow);
  }
}

function truncateJson(value: unknown): string | null {
  // The sandbox reports null for a failed run and for a program that returned nothing.
  if (value === undefined || value === null) {
    return null;
  }

  const json = JSON.stringify(value) ?? "null";
  return json.length > MAX_RESULT_CHARS ? `${json.slice(0, MAX_RESULT_CHARS)}...` : json;
}

function toRow(record: Record<string, SqlStorageValue>): LedgerRow {
  return {
    id: Number(record.id),
    createdAt: String(record.created_at),
    program: String(record.program),
    resultJson: nullableString(record.result_json),
    error: nullableString(record.error),
    facadeCalls: Number(record.facade_calls),
    roundTrips: Number(record.round_trips),
    isolateStartMs: nullableNumber(record.isolate_start_ms),
    durationMs: Number(record.duration_ms),
    tokensIn: nullableNumber(record.tokens_in),
    tokensOut: nullableNumber(record.tokens_out)
  };
}

function nullableString(value: SqlStorageValue): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: SqlStorageValue): number | null {
  return value === null || value === undefined ? null : Number(value);
}
