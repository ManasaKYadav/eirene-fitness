import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // create-next-app turns on cacheComponents and partialPrefetching, which
  // prerender a static shell and require every request-time read (cookies,
  // headers, searchParams) to sit behind its own Suspense boundary.
  //
  // Every page here is signed-in and per-user: the dashboard, workouts,
  // profile, meals and recommendations all read the session and query that
  // user's own rows, so there is no shared output to cache. Leaving the flags
  // on would mean opting each page out individually for no benefit, so they
  // are off and the app renders per request.
  turbopack: {
    // Pin the workspace root to this repo, otherwise Turbopack walks up and
    // picks up a stray package-lock.json in the home directory.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
