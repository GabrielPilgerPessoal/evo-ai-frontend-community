// Omnichannel-only build: the AI services (core, processor, bot runtime) and
// Evo Flow are not deployed, so the screens that depend on them are hidden from
// the menu and answer as Not Found. Evolution API is likewise not offered as a
// WhatsApp provider — Evolution Go is the bundled one.

// Campaigns are served by gcen-campaigns, an optional add-on. An installation
// without it leaves VITE_CAMPAIGNS_API_URL unset (the build placeholder is then
// never replaced), and the Campaigns screens stay hidden.
const campaignsApiUrl = (import.meta.env.VITE_CAMPAIGNS_API_URL ?? '').trim();
export const CAMPAIGNS_ENABLED = /^https?:\/\//.test(campaignsApiUrl);
export const CAMPAIGNS_API_URL = CAMPAIGNS_ENABLED ? campaignsApiUrl.replace(/\/$/, '') : '';

export const HIDDEN_ROUTES = [
  '/agents',
  '/journeys',
  '/journey',
  ...(CAMPAIGNS_ENABLED ? [] : ['/campaigns']),
  '/settings/ai-credentials',
  '/settings/integration-credentials',
  '/settings/custom-tools',
  '/settings/custom-mcp-servers',
  '/settings/integrations/openai',
  '/settings/admin/openai',
];

export const HIDDEN_WHATSAPP_PROVIDERS = ['evolution'];

export const isHiddenRoute = (pathname: string): boolean =>
  HIDDEN_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));
