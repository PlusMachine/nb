import * as Sentry from "@sentry/nextjs";

export const initSentry = () => {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1
  });
};

export const captureTestError = () => {
  throw new Error("Sentry test error from foundation scaffold");
};
