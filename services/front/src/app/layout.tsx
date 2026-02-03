import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../lib/AuthContext";

export const metadata: Metadata = {
  title: "POLTR | PoC Platform",
  description: "ATProto-based civic-tech platform for Swiss referenda",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
