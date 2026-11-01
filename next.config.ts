import type { NextConfig } from "next";

// Sandbox/preview only: the Base44 preview is served from a different origin
// (https://3000-<public host>), which Next.js blocks for dev assets/HMR unless
// it is allowlisted. Gated on BASE44_PREVIEW_MODE === "1"; with the flag unset
// this option is omitted and behavior is unchanged.
const previewOrigin =
  process.env.BASE44_PREVIEW_MODE === "1" && process.env.BASE44_PUBLIC_HOST_SUFFIX
    ? [`3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`]
    : undefined;

const nextConfig: NextConfig = {
  ...(previewOrigin ? { allowedDevOrigins: previewOrigin } : {}),
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
