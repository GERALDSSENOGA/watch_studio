import type { NextConfig } from "next";

// Sandbox preview only: the dev server receives requests whose Origin is the
// public preview host. BASE44_PREVIEW_MODE is provided by the platform and is
// absent (or any other value) everywhere else, leaving dev behaviour unchanged.
const previewOrigin =
  process.env.BASE44_PREVIEW_MODE === "1" && process.env.BASE44_PUBLIC_HOST_SUFFIX
    ? `3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`
    : undefined;

const nextConfig: NextConfig = {
  ...(previewOrigin ? { allowedDevOrigins: [previewOrigin] } : {}),
  // Server Actions compare the browser Origin with the forwarded host, which
  // differ behind the preview proxy; trust the preview origin only there.
  ...(previewOrigin
    ? { experimental: { serverActions: { allowedOrigins: [previewOrigin] } } }
    : {}),
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
