import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ServiceOPS — Field Service Intelligence",
  description:
    "Interactive synthetic field-service operations, dispatch, inventory, financial, and scenario demonstration.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
