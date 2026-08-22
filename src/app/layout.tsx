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
import InAppBrowserEscape from "@/components/InAppBrowserEscape";
import { UserProvider } from "@/contexts/UserContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NextService — Βρες συνεργείο αυτοκινήτου με την καλύτερη τιμή",
    template: "%s | NextService",
  },
  description:
    "Στείλε δωρεάν αίτημα service και πάρε προσφορές από συνεργεία που εξυπηρετούν την περιοχή σου. Δες πραγματικές τιμές από ολοκληρωμένες εργασίες σε service, συμπλέκτη, ιμάντα χρονισμού και φανοποιεία.",
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
      "Στείλε δωρεάν αίτημα service και πάρε προσφορές από συνεργεία της περιοχής σου. Δες πραγματικές τιμές από ολοκληρωμένες εργασίες σε service, συμπλέκτη και φανοποιεία.",
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
      "Στείλε δωρεάν αίτημα service και πάρε προσφορές από συνεργεία της περιοχής σου.",
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
        {/* Points AI crawlers at /llms.txt. React hoists <link> into <head>.
            Done here rather than through Next's `alternates.types` metadata,
            which silently emits nothing for this media type. There is no formal
            discovery standard for llms.txt yet — this is the closest convention. */}
        <link
          rel="alternate"
          type="text/plain"
          href={`${SITE_URL}/llms.txt`}
          title="llms.txt"
        />
        <AuthProvider>
          <UserProvider>
            <AppShell>
              {children}
            </AppShell>
            <ToastContainer />
            <InAppBrowserEscape />
          </UserProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
