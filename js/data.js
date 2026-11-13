/* ============================================================
   Illustrative data model for the AI Governance Dashboard.
   Everything here is fake but internally consistent. In production
   each field maps to a data source documented in the "Data Sources" tab.
   ============================================================ */

const PERIOD = {
  label: "November 2026",
  day: 13,          // "today" = Nov 13
  daysInMonth: 30,
};

// HRIS (Workday / Rippling / BambooHR) -> departments, headcount
// Finance plan -> monthly AI budget per department
// uniqueAI = distinct people with >=1 AI login in last 30d (SSO + expense + network, de-duplicated by email)
const DEPTS = [
  { id: "eng",     name: "Engineering",      headcount: 320, budget: 31000, uniqueAI: 310 },
  { id: "sales",   name: "Sales",            headcount: 210, budget: 15000, uniqueAI: 180 },
  { id: "mkt",     name: "Marketing",        headcount: 95,  budget: 6000,  uniqueAI: 80 },
  { id: "support", name: "Support", headcount: 140, budget: 8000,  uniqueAI: 105 },
  { id: "product", name: "Product & Design", headcount: 70,  budget: 9000,  uniqueAI: 66 },
  { id: "fin",     name: "Finance",          headcount: 40,  budget: 3500,  uniqueAI: 30 },
  { id: "hr",      name: "People / HR",      headcount: 35,  budget: 3000,  uniqueAI: 26 },
  { id: "legal",   name: "Legal",            headcount: 25,  budget: 2500,  uniqueAI: 15 },
];

/*
  pricing:
    "seat"     – licensed seats, cost = seats x price (fixed monthly commitment)
    "usage"    – metered API, MTD spend per dept given, grows daily by `growth`
    "expensed" – not procured; individuals expense it. cost = users x price
  users[]: active users per dept (same order as DEPTS), last 30 days
*/
const TOOLS = [
  {
    id: "chatgpt-ent", name: "ChatGPT Enterprise", vendor: "OpenAI", approved: true,
    pricing: "seat", price: 60, seats: 375, approvedSeats: 350, limit: 21000,
    users: [38, 142, 56, 28, 42, 19, 20, 7],
    source: "OpenAI Compliance API + Okta SSO", synced: "12 min ago",
  },
  {
    id: "claude-ent", name: "Claude Enterprise", vendor: "Anthropic", approved: true,
    pricing: "seat", price: 50, seats: 290, approvedSeats: 300, limit: 15000,
    users: [175, 20, 15, 10, 38, 8, 3, 9],
    source: "Anthropic Admin API + Okta SSO", synced: "12 min ago",
  },
  {
    id: "gh-copilot", name: "GitHub Copilot Business", vendor: "GitHub", approved: true,
    pricing: "seat", price: 19, seats: 320, approvedSeats: 320, limit: 7000,
    users: [288, 0, 0, 0, 9, 0, 0, 0],
    source: "GitHub Copilot metrics & billing API", synced: "1 h ago",
  },
  {
    id: "m365-copilot", name: "Microsoft 365 Copilot", vendor: "Microsoft", approved: true,
    pricing: "seat", price: 30, seats: 300, approvedSeats: 300, limit: 10500,
    users: [0, 48, 11, 52, 4, 22, 12, 6],
    source: "Microsoft Graph usage reports", synced: "Daily (24 h lag)",
  },
  {
    id: "openai-api", name: "OpenAI API", vendor: "OpenAI", approved: true,
    pricing: "usage", growth: 1.02, limit: 12000,
    spendMTD: [4100, 0, 0, 500, 700, 0, 0, 0],
    users: [45, 0, 0, 3, 8, 0, 0, 0],
    source: "OpenAI Usage & Costs API", synced: "5 min ago",
  },
  {
    id: "anthropic-api", name: "Anthropic API", vendor: "Anthropic", approved: true,
    pricing: "usage", growth: 1.01, limit: 10000,
    spendMTD: [2800, 0, 0, 0, 500, 0, 0, 0],
    users: [31, 0, 0, 0, 6, 0, 0, 0],
    source: "Anthropic Usage & Cost Admin API", synced: "5 min ago",
  },
  // ---- Shadow AI: discovered, not procured, no approved budget ----
  {
    id: "cursor", name: "Cursor Pro", vendor: "Anysphere", approved: false,
    pricing: "expensed", price: 40, limit: 0,
    users: [38, 0, 0, 0, 0, 0, 0, 0],
    source: "Ramp card feed + Google OAuth grants", synced: "Daily",
    note: "Engineers expensing alongside Copilot — evaluate for approval",
  },
  {
    id: "chatgpt-plus", name: "ChatGPT Plus (personal)", vendor: "OpenAI", approved: false,
    pricing: "expensed", price: 20, limit: 0,
    users: [0, 18, 7, 22, 0, 6, 5, 4],
    source: "Expensify reports", synced: "Daily",
    note: "Duplicates ChatGPT Enterprise — move users to Enterprise seats",
    overlapsWith: "chatgpt-ent",
  },
  {
    id: "perplexity", name: "Perplexity Pro", vendor: "Perplexity", approved: false,
    pricing: "expensed", price: 20, limit: 0,
    users: [0, 25, 8, 0, 0, 4, 0, 3],
    source: "Ramp card feed + Netskope", synced: "Daily",
  },
  {
    id: "otter", name: "Otter.ai", vendor: "Otter", approved: false,
    pricing: "expensed", price: 17, limit: 0,
    users: [0, 30, 0, 10, 0, 0, 6, 0],
    source: "Google OAuth grants + Expensify", synced: "Daily",
    note: "Records customer calls — needs security review",
  },
  {
    id: "midjourney", name: "Midjourney", vendor: "Midjourney", approved: false,
    pricing: "expensed", price: 30, limit: 0,
    users: [0, 0, 12, 0, 6, 0, 0, 0],
    source: "Ramp card feed", synced: "Daily",
  },
  {
    id: "jasper", name: "Jasper", vendor: "Jasper", approved: false,
    pricing: "expensed", price: 49, limit: 0,
    users: [0, 0, 9, 0, 0, 0, 0, 0],
    source: "Expensify reports", synced: "Daily",
  },
];
