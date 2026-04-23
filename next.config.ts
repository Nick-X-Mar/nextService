import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  trailingSlash: true,
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
    buildActivityPosition: 'bottom-right',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.s3.eu-central-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '*.s3.amazonaws.com',
      },
    ],
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.yaml$/,
      use: 'yaml-loader',
    });

    // Ensure proper path resolution for @/ aliases
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };

    return config;
  },
  // Expose environment variables to the runtime
  // NOTE: Only server-side vars here. STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
  // are intentionally excluded — they are available via process.env on server only.
  env: {
    REGION: process.env.REGION,
    DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    AMPLIFY_ROLE_ARN: process.env.AMPLIFY_ROLE_ARN,
    NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT: process.env.NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT,
    NEXT_PUBLIC_APPSYNC_API_KEY: process.env.NEXT_PUBLIC_APPSYNC_API_KEY,
    NEXT_PUBLIC_APPSYNC_REGION: process.env.NEXT_PUBLIC_APPSYNC_REGION,
    NEXT_PUBLIC_APPSYNC_ENDPOINT: process.env.NEXT_PUBLIC_APPSYNC_ENDPOINT,
    DEPOSIT_PERCENT: process.env.DEPOSIT_PERCENT,
    CANCELLATION_DEADLINE_DAYS: process.env.CANCELLATION_DEADLINE_DAYS,
    // Amplify Hosting quirk: app-level env vars are only available at build
    // time. Listing them here inlines them into the SSR bundle so they work
    // at runtime too. Never reference these from client code.
    JWT_SECRET: process.env.JWT_SECRET,
    ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,
    SESSION_EXPIRY: process.env.SESSION_EXPIRY,
    ADMIN_SESSION_EXPIRY: process.env.ADMIN_SESSION_EXPIRY,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    NOTIFICATIONS_ENABLED: process.env.NOTIFICATIONS_ENABLED,
    SES_FROM_ADDRESS: process.env.SES_FROM_ADDRESS,
    SES_REGION: process.env.SES_REGION,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
};

export default nextConfig;
