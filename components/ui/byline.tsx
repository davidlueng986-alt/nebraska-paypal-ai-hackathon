import { Bot, Landmark, Server, ShieldCheck, User } from "lucide-react";

/**
 * Who did something. "Treasurer" = the AI. "You" = a human, on PayPal.
 * "Gate" = deterministic code (I1–I7). "PayPal" = the provider's response.
 */
export type Who = "treasurer" | "you" | "gate" | "paypal" | "system";
const META: Record<Who, { label: string; Icon: typeof Bot }> = {
  treasurer: { label: "Treasurer (AI)", Icon: Bot },
  you: { label: "You", Icon: User },
  gate: { label: "Gate", Icon: ShieldCheck },
  paypal: { label: "PayPal", Icon: Landmark },
  system: { label: "Nebraska", Icon: Server },
};
export function Byline({ who, children }: { who: Who; children?: React.ReactNode }) {
  const { label, Icon } = META[who];
  return (
    <span className={`who who-${who}`}>
      <span className="who-icon" aria-hidden="true">
        <Icon size={12} strokeWidth={2} />
      </span>
      <span className="who-name">{label}</span>
      {children ? <span className="muted">{children}</span> : null}
    </span>
  );
}
