"use client";
import { BarChart3, CalendarCheck, CircleDollarSign, FileText, Inbox, PackageCheck, Play, Rocket, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useData, usePayer } from "../lib/data";
import { Honesty } from "./honesty";

export function Masthead() {
  const path = usePathname() ?? "/";
  const { period } = useData();
  const payer = usePayer();
  const maintainerSide = path.startsWith("/maintainer") || (path.startsWith("/statements") && isMaintainerQuery());
  const pending = payer.data?.grants.filter((g) => g.status === "approval_pending").length ?? 0;
  const nav = maintainerSide
    ? [
        { href: "/maintainer", label: "Income", Icon: Wallet },
        { href: "/maintainer/claim", label: "Claim a package", Icon: PackageCheck },
        { href: `/statements/${period}?as=maintainer`, label: "Statement", Icon: FileText, match: "/statements" },
      ]
    : [
        { href: "/", label: "This month", Icon: CircleDollarSign },
        { href: "/dashboard", label: "Dashboard", Icon: BarChart3 },
        { href: "/approvals", label: "Approvals", Icon: Inbox, count: pending },
        { href: "/month-end", label: "Month-end run", Icon: Play },
        { href: `/statements/${period}`, label: "Statement", Icon: FileText, match: "/statements" },
        { href: "/start", label: "Setup", Icon: Rocket },
      ];
  const active = (href: string, match?: string) =>
    match
      ? path.startsWith(match)
      : href === "/" || href === "/maintainer"
        ? path === href
        : path.startsWith(href.split("?")[0]);
  return (
    <>
      <header className="header">
        <div className="container header-row">
          <Link href={maintainerSide ? "/maintainer" : "/"} className="logo">
            <CalendarCheck size={20} aria-hidden="true" />
            Nebraska
          </Link>
          <nav className="tabs" aria-label="Main">
            {nav.map(({ href, label, Icon, count, match }) => (
              <Link key={label} href={href} className="tab" aria-current={active(href, match) ? "page" : undefined}>
                <Icon size={16} aria-hidden="true" />
                {label}
                {count ? (
                  <span className="counter counter-attention" aria-label={`${count} waiting`}>
                    {count}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
          <div className="segmented role" role="group" aria-label="View as">
            <Link href="/" aria-current={!maintainerSide ? "true" : undefined}>
              Payer
            </Link>
            <Link href="/maintainer" aria-current={maintainerSide ? "true" : undefined}>
              Maintainer
            </Link>
          </div>
        </div>
      </header>
      <Honesty />
    </>
  );
}
function isMaintainerQuery() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("as") === "maintainer";
}

export function Colophon() {
  return (
    <footer className="footer">
      <div className="container footer-row">
        <span>The AI decides where the money goes. The code decides where it can never go.</span>
        <nav aria-label="Detail">
          <Link href="/ledger">Ledger</Link>
          <Link href="/supply-chain">Supply chain</Link>
          <Link href="/settings">Settings</Link>
          <a href="https://github.com/davidlueng986-alt/nebraska-paypal-ai-hackathon">Source (MIT)</a>
        </nav>
      </div>
    </footer>
  );
}
