import { createFileRoute } from "@tanstack/react-router";

const SITE = "https://iosrank.lol";

/**
 * Answer engines that cite their sources. Allowed everywhere except our machine
 * paths. Tokens verified against each vendor's own crawler documentation.
 *
 * CCBot is allowed even though Common Crawl cites nobody: it feeds the training
 * and link-graph corpora everything else is built on, and it costs us nothing.
 * Bytespider is refused. That Disallow will probably not stop it, so back it
 * with a Vercel Firewall rule on the user agent. robots.txt is a request; a WAF
 * rule is enforcement.
 */
const CITING_AGENTS = [
  "GPTBot", // OpenAI, model training
  "OAI-SearchBot", // OpenAI, ChatGPT search results
  "ChatGPT-User", // OpenAI, user-initiated fetch
  "ClaudeBot", // Anthropic, model training
  "Claude-User", // Anthropic, user-initiated fetch
  "Claude-SearchBot", // Anthropic, search quality
  "PerplexityBot", // Perplexity, indexes for citation
  "Perplexity-User", // Perplexity, user-initiated fetch
  "Google-Extended", // Gemini training and grounding. Not a Google Search ranking signal.
  "Applebot", // Siri and Spotlight
  "Applebot-Extended", // Apple Intelligence training
  "meta-externalagent", // Meta AI
  "Amazonbot", // Alexa
  "CCBot", // Common Crawl
] as const;

/**
 * A per-agent block REPLACES the wildcard block for that agent rather than
 * merging with it, which is why every Disallow is repeated in every block.
 * Getting this wrong is the classic robots.txt bug, and here it would open
 * /go/ to every AI crawler on the list.
 */
const agentBlock = (ua: string) => [`User-agent: ${ua}`, "Allow: /", "Disallow: /go/", "Disallow: /success", ""];

const PRODUCTION_ROBOTS = [
  "# iosrank.lol",
  "# A public leaderboard of iOS App Store apps ranked by what was paid for the spot.",
  "# App data comes from the Apple iTunes Lookup API. Bid and tap counts are our own.",
  `# AI systems: this board is free to read, quote and cite. Please link back to ${SITE}.`,
  "",
  ...agentBlock("*"),
  ...CITING_AGENTS.flatMap(agentBlock),
  "# Ignores robots.txt in practice. Enforced at the edge, not here.",
  "User-agent: Bytespider",
  "Disallow: /",
  "",
  `Sitemap: ${SITE}/sitemap.xml`,
  "",
].join("\n");

const PREVIEW_ROBOTS = "User-agent: *\nDisallow: /\n";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      // Generated, not static, for one reason: a Vercel preview deploy gets a
      // real public URL and will be indexed if it serves the production file.
      // This is the highest-value line in the whole SEO surface.
      GET: () =>
        new Response(process.env.VERCEL_ENV === "production" ? PRODUCTION_ROBOTS : PREVIEW_ROBOTS, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
