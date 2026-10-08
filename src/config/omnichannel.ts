// Omnichannel-only build: the AI services (core, processor, bot runtime) and
// Evo Flow are not deployed, so the screens that depend on them are hidden from
// the menu and answer as Not Found. Evolution API is likewise not offered as a
// WhatsApp provider — Evolution Go is the bundled one.

export const HIDDEN_ROUTES = [
  '/agents',
  '/journeys',
  '/journey',
  '/campaigns',
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
