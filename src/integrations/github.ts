import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { DomainError } from "../core/util";
import { githubRepo } from "./metadata";
const api = "https://api.github.com";
export async function github(path: string, token: string) {
  const r = await fetch(api + path, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new DomainError(`GitHub HTTP ${r.status}`, 502);
  return r.json();
}
export async function verifyRepoPermission(repoUrl: string, token: string) {
  const repo = githubRepo(repoUrl);
  if (!repo)
    throw new DomainError("Only canonical GitHub repositories can be claimed");
  const remote = await github(
    `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`,
    token,
  );
  if (!remote.permissions?.admin && !remote.permissions?.maintain)
    throw new DomainError(
      "GitHub repository admin or maintain permission required",
      403,
    );
  return remote.permissions.admin ? ("admin" as const) : ("maintain" as const);
}
export async function exchangeCode(code: string) {
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri:
        (process.env.APP_URL ?? "http://localhost:3000") +
        "/api/auth/github/callback",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token)
    throw new DomainError("GitHub OAuth exchange failed", 401);
  return String(d.access_token);
}
// Never place the OAuth access token in a merely signed, readable cookie.
function key() {
  return createHash("sha256")
    .update(process.env.SESSION_SECRET ?? "")
    .digest();
}
export function sealToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
}
export function openToken(sealed: string) {
  const raw = Buffer.from(sealed, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
