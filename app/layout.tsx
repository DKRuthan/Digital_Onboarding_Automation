import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AuthProvider } from "@/components/auth/auth-provider";
import { isClerkAuthActive } from "@/lib/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Journey Control Center",
  description: "Digital Customer Journey Control Center — review and orchestrate customer communications",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkActive = isClerkAuthActive();
  const publishableKey =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider active={clerkActive} publishableKey={publishableKey}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
