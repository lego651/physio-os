import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        source: '/widget/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' https://vhealth.ca https://www.vhealth.ca http://localhost:*",
          },
          // Blanked to allow CSP frame-ancestors to take precedence.
          { key: 'X-Frame-Options', value: '' },
        ],
      },
    ]
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress Sentry build output noise
  silent: true,

  // Delete source map files from the deployed bundle after uploading to Sentry
  // (keeps source maps out of the browser while still resolving errors in Sentry)
  sourcemaps: {
    filesToDeleteAfterUpload: [".next/static/**/*.map"],
  },

  // Remove Sentry debug logging from the bundle
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },

  // Source map upload requires SENTRY_AUTH_TOKEN env var at build time
  // Set SENTRY_AUTH_TOKEN in your CI/CD environment
});
