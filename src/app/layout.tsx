import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import ToastContainer from "@/components/ToastContainer";
import { UserProvider } from "@/contexts/UserContext";
import { AuthProvider } from "@/contexts/AuthContext";
import "@/lib/amplify-config"; // Initialize Amplify

export const metadata: Metadata = {
  title: "NextService - Πλατφόρμα Επαγγελματιών",
  description: "Η καλύτερη πλατφόρμα για να βρείτε επαγγελματίες και υπηρεσίες",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="el">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased bg-surface text-on-surface">
        <AuthProvider>
          <UserProvider>
            <AppShell>
              {children}
            </AppShell>
            <ToastContainer />
          </UserProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
