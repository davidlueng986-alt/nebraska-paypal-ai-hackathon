import { allocate, usageUnits } from "./allocator";
import { recipient } from "./gate";
import { PARAMS, type State } from "./model";
import { type Actor, orgAccess, maintainerAccess } from "./auth";
import { activeHold, cooldownDays, daysSince, hash, requireRow } from "./util";
export function payerView(s: State, orgId: string, period: string, a: Actor) {
  orgAccess(a, orgId);
  const org = requireRow(s.orgs.find((o) => o.id === orgId));
  const usages = s.usages.filter(
    (u) => u.org_id === orgId && u.period === period,
  );
  const units = usageUnits(usages);
  const close = s.closes.find((c) => c.orgId === orgId && c.period === period);
  const allocations = close?.allocations ?? [];
  // Same frozen inputs with neutral AI weights (c = n = 1): what each package would get "AI off".
  const aiOff = close
    ? allocate(close.budgetCents, usageUnits(close.usageSnapshot), close.decisions, false)
    : [];
  const rows = [...units.entries()].map(([pid, u]) => {
    const p = s.packages.find((p) => p.id === pid);
    const allocation = allocations.find((x) => x.packageId === pid);
    const decisions = (close?.decisions ?? s.decisions).filter(
      (d) => d.period === period && d.subject === pid,
    );
    const criticality = [...decisions]
      .reverse()
      .find((d) => d.question === "criticality");
    const need = [...decisions].reverse().find((d) => d.question === "need");
    const claims = s.claims.filter((c) => c.packageId === pid);
    return {
      id: pid,
      name: p?.name ?? pid,
      ecosystem: p?.ecosystem,
      repoUrl: p?.repoUrl,
      u,
      c: allocation?.c ?? criticality?.value ?? 1,
      n: allocation?.n ?? need?.value ?? 1,
      cents: allocation?.cents ?? 0,
      aiOffCents: aiOff.find((x) => x.packageId === pid)?.cents ?? null,
      confidence: Math.min(criticality?.confidence ?? 0, need?.confidence ?? 0),
      reason: [criticality?.reason, need?.reason].filter(Boolean).join(" "),
      status: !claims.length
        ? "Unclaimed"
        : claims.some((c) => activeHold(s, c.maintainerId))
          ? "Held"
          : "Verified",
      signals: p?.signals,
    };
  });
  const credits = s.credits.filter(
    (c) => c.orgId === orgId && c.status !== "split" && c.status !== "recycled",
  );
  const funded = s.receipts
    .filter((r) => r.orgId === orgId && r.period === period)
    .reduce((n, r) => n + r.cents, 0);
  const allocated = allocations.reduce((n, r) => n + r.cents, 0);
  const risk = rows
    .filter(
      (r) =>
        r.signals &&
        ((r.signals.maintainerCountKnown &&
          r.signals.maintainers <= 1 &&
          r.signals.dependents > 100) ||
          r.signals.vulnerabilities.length > 0 ||
          r.status === "Held"),
    )
    .map((r) => ({
      packageId: r.id,
      name: r.name,
      maintainers: r.signals!.maintainerCountKnown
        ? r.signals!.maintainers
        : null,
      dependents: r.signals!.dependents,
      funding: r.signals!.fundingKnown ? r.signals!.fundingUsd : null,
      advisories: r.signals!.vulnerabilities,
      level: r.signals!.vulnerabilities.length
        ? "critical"
        : r.signals!.maintainerCountKnown && r.signals!.maintainers <= 1
          ? "high"
          : "review",
      reason: r.signals!.vulnerabilities.length
        ? "Relevant security advisory"
        : r.signals!.maintainerCountKnown && r.signals!.maintainers <= 1
          ? "Single maintainer with broad downstream reach"
          : "Recipient change needs review",
    }));
  return {
    org,
    period,
    rows,
    metrics: {
      funded,
      allocated,
      paid: credits
        .filter((c) => c.period === period && c.status === "paid")
        .reduce((n, c) => n + c.cents, 0),
      carry: credits
        .filter((c) => c.status === "available")
        .reduce((n, c) => n + c.cents, 0),
      repos: new Set(usages.map((u) => u.repo_hash)).size,
      packages: rows.length,
    },
    risk,
    grants: s.grants.filter((g) => g.orgId === orgId),
    statements: s.statements.filter(
      (st) =>
        st.ownerType === "org" && st.ownerId === orgId && st.period === period,
    ),
    close: close
      ? {
          id: close.id,
          snapshotHash: close.snapshotHash,
          paramsVersion: close.paramsVersion,
        }
      : null,
    subscription: s.subscriptions.filter((r) => r.orgId === orgId).at(-1),
  };
}
export function maintainerView(
  s: State,
  maintainerId: string,
  period: string,
  a: Actor,
) {
  maintainerAccess(a, maintainerId);
  const m = requireRow(s.maintainers.find((m) => m.id === maintainerId));
  const claims = s.claims.filter((c) => c.maintainerId === maintainerId);
  const packageIds = claims.map((c) => c.packageId);
  const usages = s.usages.filter(
    (u) =>
      u.period === period &&
      packageIds.includes(`${u.package.ecosystem}:${u.package.name}`),
  );
  const orgIds = [...new Set(usages.map((u) => u.org_id))];
  const credits = s.credits.filter(
    (c) => c.maintainerId === maintainerId && c.status !== "split",
  );
  const earned = credits
    .filter((c) => c.period === period)
    .reduce<
      Record<string, number>
    >((sum, c) => ({ ...sum, [c.currency]: (sum[c.currency] ?? 0) + c.cents }), {});
  return {
    maintainer: m,
    eligibility: recipient(s, m),
    cooldownDays: Math.max(0, Math.ceil(cooldownDays() - daysSince(m.emailChangedAt))),
    claims: claims.map((c) => ({
      ...c,
      package: s.packages.find((p) => p.id === c.packageId),
    })),
    usage: {
      orgCount: orgIds.length,
      repoCount: new Set(usages.map((u) => u.repo_hash)).size,
      organizations: orgIds.map((id) => {
        const o = s.orgs.find((o) => o.id === id);
        return o?.publicName ? o.name : "Private organization";
      }),
    },
    credits,
    earned,
    hold: activeHold(s, m.id) ?? null,
    statements: s.statements.filter(
      (st) =>
        st.ownerType === "maintainer" &&
        st.ownerId === maintainerId &&
        st.period === period,
    ),
    hosts: s.hosts.map((h) => ({
      id: h.id,
      name: h.name,
      repoUrl: h.repoUrl,
      verifiedAt: h.verifiedAt,
    })),
    parameters: PARAMS,
  };
}
export function auditBundle(s: State, orgId: string, period: string, a: Actor) {
  orgAccess(a, orgId);
  const closes = s.closes.filter(
    (c) => c.orgId === orgId && c.period === period,
  );
  return {
    format: "nebraska-audit-1",
    parameters: PARAMS,
    closes,
    receipts: s.receipts.filter(
      (r) => r.orgId === orgId && r.period === period,
    ),
    grants: s.grants
      .filter((g) => g.orgId === orgId && g.period === period)
      .map((g) => ({ ...g, approveUrl: undefined })),
    bundleHash: hash(closes),
  };
}
