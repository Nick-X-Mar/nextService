import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "greek"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-inter",
});
import AppShell from "@/components/layout/AppShell";
import ToastContainer from "@/components/ToastContainer";
import { UserProvider } from "@/contexts/UserContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { SITE_URL } from "@/lib/site-url";
import "@/lib/amplify-config"; // Initialize Amplify

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
    url: SITE_URL,
    title: "NextService — Βρες συνεργείο αυτοκινήτου με την καλύτερη τιμή",
    description:
      "Στείλε αίτημα σε συνεργεία σε όλη την Ελλάδα και πάρε προσφορές. Hot deals σε service, συμπλέκτη, ιμάντα χρονισμού και φανοποιεία.",
    // Explicit URL WITH trailing slash — without it, Next.js generates a URL
    // that 308-redirects under trailingSlash:true, which Facebook/Messenger
    // crawlers don't follow for OG images.
    images: [
      {
        url: `${SITE_URL}/opengraph-image/`,
        width: 1200,
        height: 630,
        alt: 'NextService',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NextService — Βρες συνεργείο αυτοκινήτου με την καλύτερη τιμή",
    description:
      "Στείλε αίτημα σε συνεργεία σε όλη την Ελλάδα και πάρε προσφορές σε service και φανοποιεία.",
    images: [`${SITE_URL}/opengraph-image/`],
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
    <html lang="el" className={inter.variable}>
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
