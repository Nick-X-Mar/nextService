import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import ToastContainer from "@/components/ToastContainer";
import { UserProvider } from "@/contexts/UserContext";
import { AuthProvider } from "@/contexts/AuthContext";
import "@/lib/amplify-config"; // Initialize Amplify

export const metadata: Metadata = {
  metadataBase: new URL("https://www.nextservice.gr"),
  title: {
    default: "NextService — Βρες συνεργείο αυτοκινήτου με την καλύτερη τιμή",
    template: "%s | NextService",
  },
  description:
    "Στείλε αίτημα σε συνεργεία σε όλη την Ελλάδα και πάρε προσφορές. Hot deals σε service, συμπλέκτη, ιμάντα χρονισμού και φανοποιεία — εργασία και επώνυμα ανταλλακτικά.",
  applicationName: "NextService",
  icons: {
    icon: "/favicon.ico",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    siteName: "NextService",
    locale: "el_GR",
    url: "https://www.nextservice.gr",
    title: "NextService — Βρες συνεργείο αυτοκινήτου με την καλύτερη τιμή",
    description:
      "Στείλε αίτημα σε συνεργεία σε όλη την Ελλάδα και πάρε προσφορές. Hot deals σε service, συμπλέκτη, ιμάντα χρονισμού και φανοποιεία.",
    images: [
      {
        url: "/logo.png",
        alt: "NextService",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NextService — Βρες συνεργείο αυτοκινήτου με την καλύτερη τιμή",
    description:
      "Στείλε αίτημα σε συνεργεία σε όλη την Ελλάδα και πάρε προσφορές σε service και φανοποιεία.",
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
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
