import type { Metadata } from "next";
import { DM_Sans, Lora } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { QueryProvider } from "@/lib/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const lora = Lora({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Abstimmungsdossier Platform",
  description: "ATProto-based civic-tech platform for Swiss referenda",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`${dmSans.variable} ${lora.variable} ${dmSans.className}`}>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            <AuthProvider>
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster position="bottom-center" richColors />
            </AuthProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
