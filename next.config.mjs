/** @type {import('next').NextConfig} */
// Deployed behind the whosyurgoat.app hub, which proxies /extravaganza/* here.
// basePath + assetPrefix keep _next asset URLs resolving through that prefix —
// without them the HTML loads but every script and stylesheet 404s.
const nextConfig = {
  basePath: '/extravaganza',
  assetPrefix: '/extravaganza',
};

export default nextConfig;
