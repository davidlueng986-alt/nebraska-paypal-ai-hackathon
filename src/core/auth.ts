import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DomainError } from "./util";
export type Actor = {
  role: "admin" | "org" | "maintainer";
  id: string;
  login?: string;
  githubToken?: string;
  exp: number;
};
function secret() {
  const s =
    process.env.SESSION_SECRET ||
    (process.env.NEBRASKA_MODE !== "sandbox"
      ? "nebraska-local-demo-signing-key-not-for-sandbox"
      : undefined);
  if (!s || s.length < 32)
    throw new DomainError(
      "SESSION_SECRET must contain at least 32 characters",
      503,
    );
  return s;
}
export function sign(value: unknown) {
  const data = Buffer.from(JSON.stringify(value)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}
export function verify<T>(token: string): T | null {
  try {
    const [data, sig] = token.split(".");
    const expected = createHmac("sha256", secret()).update(data).digest();
    const actual = Buffer.from(sig, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const value = JSON.parse(Buffer.from(data, "base64url").toString());
    if (value.exp && value.exp < Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}
export function cookie(req: Request, key: string) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(key + "="))
    ?.slice(key.length + 1);
}
export function actor(req: Request): Actor {
  if (process.env.NEBRASKA_MODE !== "sandbox")
    return { role: "admin", id: "demo", exp: Infinity };
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    bearer &&
    process.env.ADMIN_API_TOKEN &&
    safeEqual(bearer, process.env.ADMIN_API_TOKEN)
  )
    return { role: "admin", id: "service", exp: Infinity };
  const token = bearer ?? cookie(req, "nebraska_session");
  const a = token ? verify<Actor>(token) : null;
  if (!a)
    throw new DomainError(
      "Sign in with GitHub or provide a scoped API token",
      401,
      "UNAUTHENTICATED",
    );
  return a;
}
export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function admin(a: Actor) {
  if (a.role !== "admin")
    throw new DomainError("Administrator access required", 403);
}
export function orgAccess(a: Actor, orgId: string) {
  if (a.role !== "admin" && !(a.role === "org" && a.id === orgId))
    throw new DomainError("Organization access denied", 403);
}
export function maintainerAccess(a: Actor, id: string) {
  if (a.role !== "admin" && !(a.role === "maintainer" && a.id === id))
    throw new DomainError("Maintainer access denied", 403);
}
export function csrf(req: Request) {
  const origin = req.headers.get("origin");
  if (
    origin &&
    origin !== new URL(req.url).origin &&
    origin !== process.env.APP_URL
  )
    throw new DomainError("Cross-origin mutation rejected", 403);
}
export function nonce() {
  return randomBytes(24).toString("hex");
}
