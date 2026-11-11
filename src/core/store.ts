import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  emptyState,
  type Collection,
  type Event,
  type Row,
  type State,
} from "./model";
import { canonical, hash, id, now } from "./util";
export class Tx {
  events: Event[] = [];
  constructor(
    public state: State,
    private seq: number,
    private lastHash: string,
  ) {}
  put<K extends Collection>(collection: K, row: Row<K>) {
    const data = JSON.parse(JSON.stringify(row)) as Row<K>;
    const base = {
      seq: ++this.seq,
      id: id("evt"),
      collection,
      data,
      at: now(),
      prevHash: this.lastHash,
    };
    const event = { ...base, hash: hash(base) } as Event;
    this.lastHash = event.hash;
    this.events.push(event);
    apply(this.state, event);
    return data;
  }
}
function apply(s: State, e: Event) {
  const arr = s[e.collection] as { id: string }[];
  const i = arr.findIndex((x) => x.id === e.data.id);
  if (i < 0) arr.push(e.data);
  else arr[i] = e.data;
}
export function replay(events: Event[], verify = true): State {
  const s = emptyState();
  let prev = "GENESIS";
  let seq = 0;
  for (const e of events) {
    const { hash: digest, ...base } = e;
    if (
      verify &&
      (e.prevHash !== prev || e.seq !== seq + 1 || hash(base) !== digest)
    )
      throw new Error(`Ledger integrity failure at sequence ${e.seq}`);
    apply(s, e);
    prev = digest;
    seq = e.seq;
  }
  return s;
}
const schema = `CREATE TABLE IF NOT EXISTS journal (seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, collection TEXT NOT NULL, payload TEXT NOT NULL, at TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL UNIQUE);`;
export interface Store {
  read(): Promise<State>;
  events(): Promise<Event[]>;
  transact<T>(fn: (tx: Tx) => T): Promise<T>;
  close(): Promise<void>;
}
function decode(rows: Record<string, unknown>[]): Event[] {
  return rows.map((r) => ({
    seq: Number(r.seq),
    id: String(r.id),
    collection: r.collection as Collection,
    data: JSON.parse(String(r.payload)),
    at: String(r.at),
    prevHash: String(r.prev_hash),
    hash: String(r.hash),
  }));
}
export class SqliteStore implements Store {
  private db: DatabaseSync;
  constructor(path = "data/nebraska.db") {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(/* turbopackIgnore: true */ path)), {
        recursive: true,
      });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;" +
        schema +
        `CREATE TRIGGER IF NOT EXISTS journal_no_update BEFORE UPDATE ON journal BEGIN SELECT RAISE(ABORT,'append-only journal'); END; CREATE TRIGGER IF NOT EXISTS journal_no_delete BEFORE DELETE ON journal BEGIN SELECT RAISE(ABORT,'append-only journal'); END;`,
    );
  }
  async events() {
    return decode(
      this.db.prepare("SELECT * FROM journal ORDER BY seq").all() as Record<
        string,
        unknown
      >[],
    );
  }
  async read() {
    return replay(await this.events());
  }
  async transact<T>(fn: (tx: Tx) => T): Promise<T> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const events = decode(
        this.db.prepare("SELECT * FROM journal ORDER BY seq").all() as Record<
          string,
          unknown
        >[],
      );
      const tx = new Tx(
        replay(events),
        events.length,
        events.at(-1)?.hash ?? "GENESIS",
      );
      const result = fn(tx);
      if (result instanceof Promise)
        throw new Error(
          "Transaction callbacks must be synchronous; provider calls belong outside transaction",
        );
      const insert = this.db.prepare(
        "INSERT INTO journal VALUES (?,?,?,?,?,?,?)",
      );
      for (const e of tx.events)
        insert.run(
          e.seq,
          e.id,
          e.collection,
          canonical(e.data),
          e.at,
          e.prevHash,
          e.hash,
        );
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  async close() {
    this.db.close();
  }
}
export class PostgresStore implements Store {
  private pool: Pool;
  private ready: Promise<void>;
  constructor(url: string) {
    this.pool = new Pool({
      connectionString: url,
      max: 8,
      ssl:
        process.env.PGSSL === "true" ? { rejectUnauthorized: true } : undefined,
    });
    this.ready = this.init();
  }
  private async init() {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(726327821)");
      await c.query(schema);
      await c.query(
        `CREATE OR REPLACE FUNCTION reject_journal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only journal'; END $$; DROP TRIGGER IF EXISTS journal_no_mutation ON journal; CREATE TRIGGER journal_no_mutation BEFORE UPDATE OR DELETE ON journal FOR EACH ROW EXECUTE FUNCTION reject_journal_mutation();`,
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  private async rows(c: PoolClient | Pool = this.pool) {
    const r = await c.query("SELECT * FROM journal ORDER BY seq");
    return decode(r.rows);
  }
  async events() {
    await this.ready;
    return this.rows();
  }
  async read() {
    return replay(await this.events());
  }
  async transact<T>(fn: (tx: Tx) => T) {
    await this.ready;
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(726327821)");
      const events = await this.rows(c);
      const tx = new Tx(
        replay(events),
        events.length,
        events.at(-1)?.hash ?? "GENESIS",
      );
      const result = fn(tx);
      if (result instanceof Promise)
        throw new Error("Transaction callbacks must be synchronous");
      for (const e of tx.events)
        await c.query("INSERT INTO journal VALUES ($1,$2,$3,$4,$5,$6,$7)", [
          e.seq,
          e.id,
          e.collection,
          canonical(e.data),
          e.at,
          e.prevHash,
          e.hash,
        ]);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}
let instance: Store | undefined;
export function getStore(): Store {
  return (instance ??= process.env.DATABASE_URL
    ? new PostgresStore(process.env.DATABASE_URL)
    : new SqliteStore(
        process.env.SQLITE_PATH ??
          `data/${process.env.NEBRASKA_MODE === "sandbox" ? "sandbox" : "demo"}.db`,
      ));
}
