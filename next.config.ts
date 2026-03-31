import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
    buildActivityPosition: 'bottom-right',
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
  env: {
    REGION: process.env.REGION,
    DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    AMPLIFY_ROLE_ARN: process.env.AMPLIFY_ROLE_ARN,
    NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT: process.env.NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT,
    NEXT_PUBLIC_APPSYNC_API_KEY: process.env.NEXT_PUBLIC_APPSYNC_API_KEY,
    NEXT_PUBLIC_APPSYNC_REGION: process.env.NEXT_PUBLIC_APPSYNC_REGION,
    NEXT_PUBLIC_APPSYNC_ENDPOINT: process.env.NEXT_PUBLIC_APPSYNC_ENDPOINT,
  },
  /* config options here */
};

export default nextConfig;
