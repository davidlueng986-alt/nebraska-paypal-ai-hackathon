"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useData } from "../lib/data";

/** Sandbox without a session: say why pages show example data and link to sign-in. */
export function SignInBanner() {
  const { bootError } = useData();
  const path = usePathname();
  if (!bootError || !/sign in/i.test(bootError) || path === "/signin") return null;
  return (
    <div className="flash" style={{ marginBottom: 16 }}>
      You are not signed in, so this page shows example data. <Link href="/signin">Workspace sign in</Link>
    </div>
  );
}
