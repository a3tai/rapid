/**
 * Preview Proxy Worker
 * Routes pr-N.getrapid.dev to the corresponding Cloudflare Pages deployment
 *
 * Example: pr-123.getrapid.dev -> pr-123.rapid-docs.pages.dev
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Extract PR number from pr-N.getrapid.dev
    // e.g., "pr-123.getrapid.dev" -> "pr-123"
    const match = hostname.match(/^(pr-\d+)\.getrapid\.dev$/);

    if (!match) {
      // Not a PR preview URL, pass through to origin (Pages)
      return fetch(request);
    }

    const branch = match[1];

    // Construct the Pages URL
    const pagesUrl = new URL(request.url);
    pagesUrl.hostname = `${branch}.rapid-docs.pages.dev`;

    // Fetch from Pages and return the response
    const response = await fetch(pagesUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow',
    });

    // Clone response and add CORS headers if needed
    const newResponse = new Response(response.body, response);

    return newResponse;
  },
};
