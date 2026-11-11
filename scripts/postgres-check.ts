import { PostgresStore } from "../src/core/store";
import { Nebraska } from "../src/core/service";
import { DemoDecisionProvider } from "../src/core/decisions";
import { DemoPayments } from "../src/integrations/paypal";
import { seedDemo } from "../src/core/seed";
import { Pool } from "pg";
const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error(
    "Set TEST_DATABASE_URL to an isolated empty PostgreSQL test database",
  );
const a = new PostgresStore(url),
  b = new PostgresStore(url);
try {
  const service = new Nebraska(
    a,
    new DemoDecisionProvider(),
    new DemoPayments(),
  );
  await seedDemo(service, "2026-11");
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      (i % 2 ? a : b).transact((tx) =>
        tx.put("webhooks", {
          id: "concurrency-" + i,
          type: "test",
          at: new Date().toISOString(),
          resourceId: String(i),
        }),
      ),
    ),
  );
  const events = await a.events();
  if (events.some((e, i) => e.seq !== i + 1))
    throw new Error("Noncontiguous journal sequence");
  const batch = await service.executePayout("2026-11");
  if (batch.status !== "complete") throw new Error("Settlement incomplete");
  const pg = new Pool({ connectionString: url });
  try {
    for (const sql of [
      "UPDATE journal SET at = at WHERE seq=1",
      "DELETE FROM journal WHERE seq=1",
    ]) {
      let denied = false;
      try {
        await pg.query(sql);
      } catch {
        denied = true;
      }
      if (!denied) throw new Error("Append-only trigger bypassed");
    }
  } finally {
    await pg.end();
  }
  console.log(
    JSON.stringify({
      database: "PostgreSQL",
      events: events.length,
      concurrentWriters: 2,
      transactions: 12,
      appendOnlyTriggers: "passed",
      batch: batch.id,
      status: batch.status,
    }),
  );
} finally {
  await a.close();
  await b.close();
}
