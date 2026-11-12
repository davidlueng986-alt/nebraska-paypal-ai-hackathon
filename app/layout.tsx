import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Nebraska", template: "%s · Nebraska" },
  description:
    "Nebraska pays the open-source maintainers behind your AI coding agent's dependencies, every month, by actual usage, through PayPal.",
};
export const viewport: Viewport = { themeColor: "#F6F8FA" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
