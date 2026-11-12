import { DataProvider } from "@/components/lib/data";
import { Colophon, Masthead } from "@/components/shell/masthead";
import { SignInBanner } from "@/components/auth/signin-banner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Masthead />
      <main id="main">
        <div className="container">
          <SignInBanner />
          {children}
        </div>
      </main>
      <Colophon />
    </DataProvider>
  );
}
