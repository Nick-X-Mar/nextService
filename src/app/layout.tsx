import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "greek"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-inter",
});

// The Material Symbols subset of src/lib/icons.ts, served from our own domain
// and preloaded like Inter (refresh it with scripts/fetch-icon-font.ts). From
// fonts.googleapis.com it was a render-blocking stylesheet plus a second hop to
// fonts.gstatic.com before any page could paint. `block`: an icon is never
// shown as its word while the font loads.
const materialSymbols = localFont({
  src: "./fonts/material-symbols-outlined.woff2",
  display: "block",
  variable: "--font-material-symbols",
  adjustFontFallback: false,
});
import AppShell from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ToastProvider";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import InAppBrowserEscape from "@/components/InAppBrowserEscape";
import PwaManager from "@/components/PwaManager";
import { INSTALL_PROMPT_SCRIPT } from "@/lib/pwa";
import AnalyticsConsent from "@/components/AnalyticsConsent";
import { CONSENT_SETTLED_SCRIPT } from "@/lib/analytics";
import NumberWheelGuard from "@/components/NumberWheelGuard";
import { UserProvider } from "@/contexts/UserContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { SITE_URL, IS_INDEXABLE } from "@/lib/site-url";

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
    // The installed app's icon on an iPhone (the manifest's are Android's and
    // computers'), the same NS mark.
    apple: "/icons/apple-touch-icon.png",
  },
  // Installed on an iPhone (src/app/manifest.ts): its name under the icon, and
  // the page below the status bar rather than under it.
  appleWebApp: {
    capable: true,
    title: "NextService",
    statusBarStyle: "default",
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
    index: IS_INDEXABLE,
    follow: IS_INDEXABLE,
    googleBot: {
      index: IS_INDEXABLE,
      follow: IS_INDEXABLE,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  // The `surface` token: the browser bar and the installed app's status bar.
  themeColor: "#fbf9f8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: CONSENT_SETTLED_SCRIPT may set an attribute on
    // <html> before React hydrates it.
    <html lang="el" className={`${inter.variable} ${materialSymbols.variable}`} suppressHydrationWarning>
      <body className="font-body antialiased bg-surface text-on-surface">
        {/* First in <body>: runs before the consent banner below is parsed. */}
        <script dangerouslySetInnerHTML={{ __html: CONSENT_SETTLED_SCRIPT }} />
        {/* Keeps the browser's install offer for the /app/ page (see lib/pwa.ts). */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_SCRIPT }} />
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
            <ToastProvider>
              <ConfirmProvider>
                <AppShell>
                  {children}
                </AppShell>
                {/* Inside the toasts: its notification prompt reports through them. */}
                <PwaManager />
              </ConfirmProvider>
            </ToastProvider>
            <InAppBrowserEscape />
            <AnalyticsConsent />
            <NumberWheelGuard />
          </UserProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
