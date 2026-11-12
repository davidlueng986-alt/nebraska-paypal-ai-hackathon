"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** The one line a payer adds to their coding agent (a Claude Code Stop hook). */
export function hookCommand(orgId: string) {
  return `NEBRASKA_ORG_ID=${orgId} npx tsx nebraska/scripts/meter.ts --root "$CLAUDE_PROJECT_DIR" --agent claude-code --changed-only --base HEAD`;
}

export function HookLine({ orgId }: { orgId: string }) {
  const [copied, setCopied] = useState(false);
  const text = hookCommand(orgId || "org_YOUR_ORG");
  return (
    <div className="code-block">
      <pre tabIndex={0} aria-label="Hook command">
        {text}
      </pre>
      <button
        className="btn btn-sm"
        aria-label={copied ? "Copied" : "Copy command"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            /* clipboard blocked: the text stays selectable */
          }
        }}
      >
        {copied ? <Check size={14} className="success" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
