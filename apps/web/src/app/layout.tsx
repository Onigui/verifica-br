import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VerificaBR", template: "%s · VerificaBR" },
  description: "Verificação de alegações públicas baseada em evidências rastreáveis.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
