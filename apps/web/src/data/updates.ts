/**
 * Site changelog — newest first. Feeds /updates (the freshness surface for
 * answer engines) and nothing else; keep entries factual and dated.
 */
export const updates = [
  {
    date: '2026-07-19',
    title: 'MCP server opened to every AI platform',
    text: 'Published to the official MCP registry (com.530amodel/calculator) with ChatGPT-compatible search/fetch tools, structured tool results, and platform setup guides for Claude, ChatGPT, Cursor, and agent APIs.',
  },
  {
    date: '2026-07-19',
    title: 'Live fund returns in the Advanced Model',
    text: 'New fund and historic-period dials set the return assumption from real market data (trailing 1/5/10-year annualized returns for the eligible funds), converted to after-inflation terms with the math shown.',
  },
  {
    date: '2026-07-19',
    title: 'New guides: glossary, withdrawals, timing, employer money, 530A vs 529',
    text: 'Five plain-English reference pages covering the questions families actually search, each grounded in the verified rules and linked to primary sources.',
  },
  {
    date: '2026-07-15',
    title: 'Security hardening',
    text: 'Strict Content-Security-Policy with per-build script hashes, HSTS, and per-IP rate limiting on all public endpoints.',
  },
  {
    date: '2026-07-14',
    title: 'Pledges & gifts feed',
    text: 'A tracked feed of reported 530A pledge programs, with human-reviewed entries you can model for your own child in one click — now also available as RSS.',
  },
  {
    date: '2026-07-13',
    title: 'Public API and MCP server',
    text: 'The calculator engine became free to call: JSON API with OpenAPI spec, and a read-only MCP server for AI assistants. No auth, nothing stored, attribution asked.',
  },
  {
    date: '2026-07-12',
    title: 'Rules verified against primary sources',
    text: 'Every figure re-checked against the statute, IRS Notice 2025-68, and the CRS overview. Unverifiable items (529 rollover, early-withdrawal penalty, cap indexing mechanics) remain explicitly flagged pending the expected March 2026 regulations.',
  },
  {
    date: '2026-07-12',
    title: '530amodel.com launch',
    text: 'Free, privacy-first 530A calculator: instant projection widget, Advanced Model with seeded Monte-Carlo ranges, and cent-exact math cross-verified between two independent implementations.',
  },
]
