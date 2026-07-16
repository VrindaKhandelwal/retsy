/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Google's OAuth consent screen shows the redirect URI's domain
  // ("Continue to <domain>"). Proxying the callback through the app's own
  // domain makes that read "app.retsy.xyz" instead of the raw
  // *.supabase.co project URL. GOOGLE_REDIRECT_URI on the edge functions
  // must match this path.
  async rewrites() {
    return [
      {
        source: "/auth/gmail-callback",
        destination:
          "https://dssuazxmyjwztqvuyeyb.supabase.co/functions/v1/gmail-oauth-callback",
      },
    ];
  },
};

module.exports = nextConfig;
