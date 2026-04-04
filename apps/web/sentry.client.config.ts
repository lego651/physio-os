import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // No performance monitoring yet
  tracesSampleRate: 0,

  // No session replay yet
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
