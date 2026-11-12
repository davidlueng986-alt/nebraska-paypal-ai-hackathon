import { NextResponse } from "next/server";
import { z } from "zod";
import {
  actor,
  admin,
  cookie,
  csrf,
  maintainerAccess,
  nonce,
  orgAccess,
  sign,
  verify,
  type Actor,
} from "@/src/core/auth";
import { getService } from "@/src/core/runtime";
import { seedDemo } from "@/src/core/seed";
import {
  currencySchema,
  ecosystemSchema,
  periodSchema,
  usageSchema,
  type Currency,
} from "@/src/core/model";
import { auditBundle, maintainerView, payerView } from "@/src/core/views";
import {
  daysSince,
  DomainError,
  hash,
  id,
  now,
  periodOf,
  requireRow,
} from "@/src/core/util";
import { getPayments } from "@/src/integrations/paypal";
import { handleWebhook } from "@/src/integrations/webhooks";
import {
  exchangeCode,
  github,
  openToken,
  sealToken,
  verifyRepoPermission,
} from "@/src/integrations/github";
import { resolvePackage, queryOsv } from "@/src/integrations/metadata";
import { Treasurer } from "@/src/core/treasurer";
import {
  isTerminal,
  newRunId,
  readRun,
  runMonthEnd,
} from "@/src/core/monthend";
import { reconcile } from "@/src/integrations/reconcile";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const j = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const secure = process.env.APP_URL?.startsWith("https://") ?? false;
async function json(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 2_000_000)
    throw new DomainError("Payload too large", 413);
  const text = await req.text();
  if (Buffer.byteLength(text) > 2_000_000)
    throw new DomainError("Payload too large", 413);
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new DomainError("Invalid JSON");
  }
}
async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url),
      path = url.pathname.slice(5),
      method = req.method;
    const service = getService();
    const payments = getPayments();
    const period = periodSchema.parse(
      url.searchParams.get("period") ?? periodOf(),
    );
    if (method === "GET" && path === "health")
      return j({ status: "ok", mode: service.mode, version: "1.0.0" });
    if (method === "POST" && path === "webhooks/paypal")
      return j(
        await handleWebhook(service, payments, req.headers, await json(req)),
      );
    if (path === "auth/github" && method === "GET") {
      if (!process.env.GITHUB_CLIENT_ID)
        throw new DomainError(
          "Configure GitHub OAuth to verify repository ownership",
          503,
        );
      const state = nonce();
      const response = NextResponse.redirect(
        `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(process.env.GITHUB_CLIENT_ID)}&redirect_uri=${encodeURIComponent((process.env.APP_URL ?? url.origin) + "/api/auth/github/callback")}&scope=read:user%20public_repo&state=${state}`,
      );
      response.cookies.set(
        "nebraska_oauth",
        sign({ state, exp: Date.now() + 600000 }),
        { httpOnly: true, secure, sameSite: "lax", maxAge: 600, path: "/" },
      );
      return response;
    }
    if (path === "auth/github/callback" && method === "GET") {
      const pending = verify<{ state: string; exp: number }>(
        cookie(req, "nebraska_oauth") ?? "",
      );
      if (!pending || pending.state !== url.searchParams.get("state"))
        throw new DomainError("Invalid OAuth state", 401);
      const token = await exchangeCode(
        requireRow(
          url.searchParams.get("code") ?? undefined,
          "OAuth code missing",
        ),
      );
      const user = await github("/user", token);
      const a: Actor = {
        role: "maintainer",
        id: "gh_" + user.id,
        login: user.login,
        githubToken: sealToken(token),
        exp: Date.now() + 8 * 3600000,
      };
      const response = NextResponse.redirect(
        new URL("/?view=maintainer", process.env.APP_URL ?? url.origin),
      );
      response.cookies.set("nebraska_session", sign(a), {
        httpOnly: true,
        secure,
        sameSite: "lax",
        maxAge: 8 * 3600,
        path: "/",
      });
      response.cookies.delete("nebraska_oauth");
      return response;
    }
    if ((path === "auth/admin" || path === "auth/token") && method === "POST") {
      csrf(req);
      const body = z.object({ token: z.string() }).parse(await json(req));
      const a = actor(
        new Request(req.url, {
          headers: { Authorization: "Bearer " + body.token },
        }),
      );
      if (path === "auth/admin") admin(a);
      const response = j({ signedIn: true });
      response.cookies.set(
        "nebraska_session",
        sign({ ...a, exp: Math.min(a.exp, Date.now() + 8 * 3600000) }),
        {
          httpOnly: true,
          secure,
          sameSite: "lax",
          maxAge: 8 * 3600,
          path: "/",
        },
      );
      return response;
    }
    if (path === "auth/logout" && method === "POST") {
      csrf(req);
      const response = j({ signedOut: true });
      response.cookies.delete("nebraska_session");
      return response;
    }
    if (method !== "GET") csrf(req);
    const a = actor(req);
    if (path === "bootstrap" && method === "GET") {
      if (service.mode === "demo") await seedDemo(service);
      const s = await service.store.read();
      const orgs = s.orgs
        .filter(
          (o) => a.role === "admin" || (a.role === "org" && a.id === o.id),
        )
        .map((o) => ({
          id: o.id,
          name: o.name,
          currency: o.currency,
          status: o.status,
        }));
      const maintainers = s.maintainers
        .filter(
          (m) =>
            a.role === "admin" || (a.role === "maintainer" && a.id === m.id),
        )
        .map((m) => ({ id: m.id, login: m.login }));
      const periods = [
        ...new Set([
          periodOf(),
          ...s.usages
            .filter(
              (u) =>
                a.role === "admin" ||
                (a.role === "org" && u.org_id === a.id) ||
                (a.role === "maintainer" &&
                  s.claims.some(
                    (c) =>
                      c.maintainerId === a.id &&
                      c.packageId ===
                        `${u.package.ecosystem}:${u.package.name}`,
                  )),
            )
            .map((u) => u.period),
        ]),
      ]
        .sort()
        .reverse();
      return j({
        mode: service.mode,
        actor: { role: a.role, id: a.id, login: a.login },
        orgs,
        maintainers,
        periods,
        packages: s.packages.map((p) => ({
          id: p.id,
          name: p.name,
          ecosystem: p.ecosystem,
          repoUrl: p.repoUrl,
        })),
        version: "1.0.0",
      });
    }
    if (path === "payer" && method === "GET")
      return j(
        payerView(
          await service.store.read(),
          url.searchParams.get("org") ?? "org_acme",
          period,
          a,
        ),
      );
    if (path === "maintainer" && method === "GET")
      return j(
        maintainerView(
          await service.store.read(),
          url.searchParams.get("id") ?? a.id,
          period,
          a,
        ),
      );
    if (path === "audit" && method === "GET") {
      const orgId = url.searchParams.get("org") ?? "org_acme";
      return j(auditBundle(await service.store.read(), orgId, period, a));
    }
    if (path === "ledger" && method === "GET") {
      admin(a);
      const s = await service.store.read();
      return j({
        batches: s.batches.filter((b) => b.period === period),
        audits: s.audits.slice(-100).reverse(),
        events: (await service.store.events()).length,
        chainHash: (await service.store.events()).at(-1)?.hash,
        holds: s.holds.filter((h) => !h.releasedAt),
        webhooks: s.webhooks.slice(-30),
      });
    }
    if (path === "export" && method === "GET") {
      const view = payerView(
        await service.store.read(),
        url.searchParams.get("org") ?? "org_acme",
        period,
        a,
      );
      const cell = (x: unknown) => {
        let text = String(x ?? "");
        if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replaceAll('"', '""') + '"';
      };
      const csv = [
        [
          "Package",
          "Ecosystem",
          "Usage",
          "Criticality",
          "Need",
          "Amount",
          "Currency",
          "Confidence",
          "Status",
          "AI reason",
        ],
        ...view.rows.map((r) => [
          r.name,
          r.ecosystem,
          r.u,
          r.c,
          r.n,
          (r.cents / 100).toFixed(2),
          view.org.currency,
          r.confidence,
          r.status,
          r.reason,
        ]),
      ]
        .map((r) => r.map(cell).join(","))
        .join("\r\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="nebraska-${period}.csv"`,
        },
      });
    }
    if (path === "paypal/return" && method === "GET") {
      if (url.searchParams.get("kind") === "grant") {
        const g = requireRow(
          (await service.store.read()).grants.find(
            (g) => g.id === url.searchParams.get("grant"),
          ),
        );
        orgAccess(a, g.orgId);
        if (url.searchParams.get("token") !== g.orderId)
          throw new DomainError("Order return token mismatch", 409);
        await service.captureGrant(g.id);
      } else {
        const subscriptionId =
          url.searchParams.get("subscription_id") ??
          url.searchParams.get("ba_token");
        if (!subscriptionId)
          throw new DomainError("Missing subscription return identifier");
        const s = await service.store.read();
        const pending = requireRow(
          s.subscriptions.find((r) => r.providerId === subscriptionId),
        );
        orgAccess(a, pending.orgId);
        await service.refreshSubscription(subscriptionId);
      }
      return NextResponse.redirect(
        new URL("/?approval=complete", process.env.APP_URL ?? url.origin),
      );
    }
    const body = method === "POST" ? await json(req) : {};
    if (path === "usage" && method === "POST") {
      const parsed = z
        .object({ events: z.array(usageSchema).min(1).max(100) })
        .strict()
        .parse(body);
      for (const e of parsed.events) orgAccess(a, e.org_id);
      const results = [];
      for (const e of parsed.events) results.push(await service.recordUsage(e));
      return j({ results });
    }
    if (path === "orgs" && method === "POST") {
      admin(a);
      const b = z
        .object({
          name: z.string().min(1).max(100),
          currency: currencySchema,
          publicName: z.boolean().default(false),
        })
        .strict()
        .parse(body);
      const o = await service.store.transact((tx) =>
        tx.put("orgs", {
          id: id("org"),
          name: b.name,
          currency: b.currency,
          budgetCents: 0,
          status: "pending",
          publicName: b.publicName,
          owner: a.id,
        }),
      );
      return j(o, 201);
    }
    if (path === "org/privacy" && method === "POST") {
      const b = z
        .object({ orgId: z.string(), publicName: z.boolean() })
        .strict()
        .parse(body);
      orgAccess(a, b.orgId);
      return j(
        await service.store.transact((tx) => {
          const o = requireRow(tx.state.orgs.find((o) => o.id === b.orgId));
          return tx.put("orgs", { ...o, publicName: b.publicName });
        }),
      );
    }
    if (path === "tokens" && method === "POST") {
      admin(a);
      const b = z
        .object({
          orgId: z.string(),
          days: z.number().int().min(1).max(365).default(30),
        })
        .parse(body);
      requireRow(
        (await service.store.read()).orgs.find((o) => o.id === b.orgId),
      );
      return j({
        token: sign({
          role: "org",
          id: b.orgId,
          exp: Date.now() + b.days * 86400000,
        }),
        expiresInDays: b.days,
      });
    }
    if (path === "subscription" && method === "POST") {
      const b = z
        .object({
          orgId: z.string(),
          quantity: z.number().int().positive().max(100000),
        })
        .strict()
        .parse(body);
      orgAccess(a, b.orgId);
      return j(await service.subscribe(b.orgId, b.quantity));
    }
    if (path === "subscription/cancel" && method === "POST") {
      const b = z.object({ orgId: z.string() }).parse(body);
      orgAccess(a, b.orgId);
      await service.cancelSubscription(b.orgId);
      return j({ cancelled: true });
    }
    if (path === "packages/resolve" && method === "POST") {
      admin(a);
      const b = z
        .object({
          ecosystem: ecosystemSchema,
          name: z.string().min(1).max(200),
          version: z.string().min(1).max(100),
        })
        .strict()
        .parse(body);
      const p = await resolvePackage(b.ecosystem, b.name, b.version);
      await service.store.transact((tx) => tx.put("packages", p));
      return j(p);
    }
    if (path === "claims" && method === "POST") {
      const b = z
        .object({
          packageId: z.string(),
          email: z.string().email(),
          maintainerId: z.string().optional(),
        })
        .strict()
        .parse(body);
      const s = await service.store.read();
      const p = requireRow(s.packages.find((p) => p.id === b.packageId));
      const mid = service.mode === "demo" ? (b.maintainerId ?? "m3") : a.id;
      maintainerAccess(a, mid);
      const permission =
        service.mode === "demo"
          ? "admin"
          : await verifyRepoPermission(
              p.repoUrl,
              openToken(requireRow(a.githubToken, "GitHub login required")),
            );
      const claim = await service.store.transact((tx) => {
        const existing = tx.state.maintainers.find((m) => m.id === mid);
        if (existing && existing.email !== b.email)
          throw new DomainError(
            "Use the recipient settings flow to change an existing email",
            409,
          );
        tx.put(
          "maintainers",
          existing ?? {
            id: mid,
            login: a.login ?? mid,
            email: b.email,
            verifiedAt: now(),
            emailChangedAt: now(),
          },
        );
        const old = tx.state.claims.find(
          (c) => c.packageId === p.id && c.maintainerId === mid,
        );
        if (old) return old;
        const c = tx.put("claims", {
          id: `claim:${p.id}:${mid}`,
          packageId: p.id,
          maintainerId: mid,
          share: 1,
          permission,
          claimedAt: now(),
        });
        return c;
      });
      await service.attachUnclaimed(p.id);
      return j(claim);
    }
    if (path === "claims/shares" && method === "POST") {
      const b = z
        .object({
          packageId: z.string(),
          shares: z
            .array(
              z.object({
                maintainerId: z.string(),
                share: z.number().positive().max(1),
              }),
            )
            .min(1)
            .max(100),
        })
        .strict()
        .parse(body);
      const s = await service.store.read();
      const p = requireRow(s.packages.find((p) => p.id === b.packageId));
      if (service.mode !== "demo") {
        if (!a.githubToken) throw new DomainError("GitHub login required", 401);
        const permission = await verifyRepoPermission(
          p.repoUrl,
          openToken(a.githubToken),
        );
        if (permission !== "admin")
          throw new DomainError(
            "Only repository administrators can change shares",
            403,
          );
      }
      if (
        Math.abs(b.shares.reduce((n, s) => n + s.share, 0) - 1) > 0.000001 ||
        new Set(b.shares.map((x) => x.maintainerId)).size !== b.shares.length
      )
        throw new DomainError("Unique shares must sum to 1");
      return j(
        await service.store.transact((tx) => {
          const claims = tx.state.claims.filter(
            (c) => c.packageId === b.packageId,
          );
          if (
            claims.length !== b.shares.length ||
            claims.some(
              (c) => !b.shares.some((s) => s.maintainerId === c.maintainerId),
            )
          )
            throw new DomainError("Shares must cover every verified claimant");
          for (const c of claims)
            tx.put("claims", {
              ...c,
              share: b.shares.find((s) => s.maintainerId === c.maintainerId)!
                .share,
            });
          return { updated: true, effective: "future allocations" };
        }),
      );
    }
    if (path === "recipient" && method === "POST") {
      const b = z
        .object({ maintainerId: z.string(), email: z.string().email() })
        .strict()
        .parse(body);
      maintainerAccess(a, b.maintainerId);
      await service.store.transact((tx) => {
        const m = requireRow(
          tx.state.maintainers.find((m) => m.id === b.maintainerId),
        );
        if (m.email !== b.email)
          tx.put("maintainers", {
            ...m,
            email: b.email,
            emailChangedAt: now(),
          });
      });
      await service.hold(
        b.maintainerId,
        "Recipient email changed; requires review and 14-day cooldown",
      );
      return j({ updated: true, cooldownDays: 14 });
    }
    if (path === "hosts" && method === "POST") {
      admin(a);
      const b = z
        .object({
          name: z.string().min(1).max(100),
          email: z.string().email(),
          repoUrl: z.string().url(),
          attestation: z.literal(
            "I verified the fiscal host identity and its authority to receive these funds",
          ),
        })
        .strict()
        .parse(body);
      return j(
        await service.store.transact((tx) =>
          tx.put("hosts", {
            id: id("host"),
            name: b.name,
            email: b.email,
            repoUrl: b.repoUrl,
            verifiedAt: now(),
            changedAt: now(),
            verifiedBy: a.id,
          }),
        ),
      );
    }
    if (path === "recipient/host" && method === "POST") {
      const b = z
        .object({ maintainerId: z.string(), hostId: z.string().nullable() })
        .strict()
        .parse(body);
      maintainerAccess(a, b.maintainerId);
      return j(
        await service.store.transact((tx) => {
          const m = requireRow(
            tx.state.maintainers.find((m) => m.id === b.maintainerId),
          );
          if (b.hostId)
            requireRow(
              tx.state.hosts.find((h) => h.id === b.hostId && h.verifiedAt),
              "Verified fiscal host not found",
            );
          return tx.put("maintainers", {
            ...m,
            hostId: b.hostId ?? undefined,
            hostAuthorizedAt: now(),
            emailChangedAt: now(),
          });
        }),
      );
    }
    if (path === "holds/release" && method === "POST") {
      admin(a);
      const b = z.object({ maintainerId: z.string() }).parse(body);
      await service.releaseHold(b.maintainerId);
      return j({ released: true });
    }
    if (path === "grants/propose" && method === "POST") {
      const b = z
        .object({
          orgId: z.string(),
          packageId: z.string(),
          period: periodSchema,
        })
        .strict()
        .parse(body);
      orgAccess(a, b.orgId);
      return j(await service.proposeGrant(b.period, b.orgId, b.packageId));
    }
    if (path === "grants/decline" && method === "POST") {
      const b = z.object({ grantId: z.string() }).parse(body);
      const g = requireRow(
        (await service.store.read()).grants.find((g) => g.id === b.grantId),
      );
      orgAccess(a, g.orgId);
      if (g.status === "captured")
        throw new DomainError("Captured grants cannot be declined", 409);
      return j(
        await service.store.transact((tx) =>
          tx.put("grants", { ...g, status: "declined" }),
        ),
      );
    }
    if (path === "demo/approve" && method === "POST") {
      if (service.mode !== "demo")
        throw new DomainError("Demo operations disabled", 403);
      const b = z
        .object({ kind: z.enum(["grant", "subscription"]), id: z.string() })
        .parse(body);
      if (b.kind === "grant") return j(await service.captureGrant(b.id));
      return j(
        await service.store.transact((tx) => {
          const r = requireRow(
            tx.state.subscriptions.find((r) => r.id === b.id),
          );
          const o = requireRow(tx.state.orgs.find((o) => o.id === r.orgId));
          tx.put("orgs", {
            ...o,
            budgetCents: r.quantity * 100,
            subscriptionId: r.providerId,
            status: "active",
          });
          tx.put("subscriptions", { ...r, status: "activated" });
          const rid = "demo-sale:" + r.id;
          if (!tx.state.receipts.some((x) => x.id === rid)) {
            let p = periodOf();
            while (
              tx.state.closes.some((c) => c.orgId === o.id && c.period === p)
            ) {
              const [y, m] = p.split("-").map(Number);
              p = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
            }
            tx.put("receipts", {
              id: rid,
              orgId: o.id,
              period: p,
              currency: o.currency,
              cents: r.quantity * 100,
              providerId: rid,
              kind: "subscription",
              receivedAt: now(),
            });
          }
          return { approved: true, simulation: true };
        }),
      );
    }
    if (path === "month-end/runs" && method === "POST") {
      admin(a);
      const b = z
        .object({ period: periodSchema, execute: z.boolean().default(true) })
        .strict()
        .parse(body);
      const run_id = newRunId(b.period);
      void runMonthEnd(service, b.period, run_id, { execute: b.execute });
      return j({ run_id, events: `/api/month-end/runs/${run_id}/events` }, 202);
    }
    const sse = /^month-end\/runs\/([\w:.-]+)\/events$/.exec(path);
    if (sse && method === "GET") {
      admin(a);
      const runId = sse[1];
      const replay = url.searchParams.get("replay") === "1";
      const delay = replay
        ? Math.min(5000, Number(url.searchParams.get("delay_ms") ?? 600) || 0)
        : 0;
      const enc = new TextEncoder();
      let sent = 0;
      const stream = new ReadableStream({
        async start(controller) {
          const started = Date.now();
          const deadline = started + 10 * 60_000;
          try {
            for (;;) {
              const events = await readRun(service, runId);
              if (!events.length && Date.now() - started > 20_000)
                throw new Error("Unknown run");
              for (const e of events.slice(sent)) {
                controller.enqueue(
                  enc.encode(`id: ${e.seq}\nevent: month-end\ndata: ${JSON.stringify(e)}\n\n`),
                );
                sent = e.seq;
                if (delay) await new Promise((r) => setTimeout(r, delay));
              }
              if (events.at(-1) && isTerminal(events.at(-1)!)) break;
              if (Date.now() > deadline) break;
              await new Promise((r) => setTimeout(r, 250));
            }
          } catch {
            controller.enqueue(enc.encode("event: error\ndata: {\"error\":\"run not found\"}\n\n"));
          }
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store, no-transform",
          Connection: "keep-alive",
        },
      });
    }
    if (path === "treasurer" && method === "POST") {
      admin(a);
      const b = z
        .object({ period: periodSchema, execute: z.boolean().default(true) })
        .strict()
        .parse(body);
      return j(await new Treasurer(service).run(b.period, b.execute));
    }
    if (path === "analyze" && method === "POST") {
      admin(a);
      const b = z.object({ period: periodSchema }).parse(body);
      return j(await service.analyze(b.period));
    }
    if (path === "payout/sync" && method === "POST") {
      admin(a);
      const b = z.object({ batchId: z.string() }).parse(body);
      return j(await service.syncBatch(b.batchId));
    }
    if (path === "payout/cancel-unclaimed" && method === "POST") {
      admin(a);
      const b = z
        .object({ batchId: z.string(), itemId: z.string() })
        .parse(body);
      return j(await service.cancelUnclaimed(b.batchId, b.itemId));
    }
    if (path === "reconcile" && method === "POST") {
      admin(a);
      const b = z
        .object({ period: periodSchema, toolkit: z.boolean().default(false) })
        .parse(body);
      return j(await reconcile(service, payments, b.period, b.toolkit));
    }
    if (path === "osv/scan" && method === "POST") {
      admin(a);
      const b = z.object({ period: periodSchema }).parse(body);
      const s = await service.store.read();
      const proposals = [];
      for (const p of s.packages) {
        const vulnerabilities =
          service.mode === "demo"
            ? p.signals.vulnerabilities
            : await queryOsv(p.ecosystem, p.name, p.version);
        await service.store.transact((tx) =>
          tx.put("packages", {
            ...p,
            signals: { ...p.signals, vulnerabilities },
          }),
        );
        if (vulnerabilities.length)
          for (const org of s.orgs.filter((o) =>
            s.usages.some(
              (u) =>
                u.org_id === o.id &&
                `${u.package.ecosystem}:${u.package.name}` === p.id,
            ),
          ))
            proposals.push(await service.proposeGrant(b.period, org.id, p.id));
      }
      return j({ scanned: s.packages.length, proposals });
    }
    throw new DomainError("API route not found", 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return j({ error: "Validation failed", issues: error.issues }, 400);
    if (error instanceof DomainError)
      return j({ error: error.message, code: error.code }, error.status);
    console.error(
      "[nebraska]",
      error instanceof Error ? error.message : "Unexpected server error",
    );
    return j(
      { error: "Server operation failed. Check the server log for details." },
      500,
    );
  }
}
export const GET = handler;
export const POST = handler;
