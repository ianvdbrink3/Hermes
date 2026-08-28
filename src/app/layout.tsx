import type { Metadata } from "next";
import { OwnerActionCenter } from "@/components/owner-action-center";
import { GitAuthorGateBridge } from "@/components/git-author-gate-bridge";
import { PersistentHermesChatV5 } from "@/components/persistent-hermes-chat-v5";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hermes Investment OS",
  description: "Eenvoudig overzicht van Hermes onderzoek, trading en veiligheid",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        {children}
        <OwnerActionCenter />
        <GitAuthorGateBridge />
        <PersistentHermesChatV5 />
      </body>
    </html>
  );
}
