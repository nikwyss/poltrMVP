import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: 'standalone',
  // Disables React's dev-only double render/effect invocation. That double
  // call is a deliberate aid to surface missing effect cleanups / double
  // subscriptions; turning it off hides those. It never affected production.
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
