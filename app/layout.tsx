import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nebraska — Open source, paid forward.",
  description:
    "AI coding agents fund the open-source maintainers they depend on. Actual usage. Bounded decisions. PayPal settlement.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
