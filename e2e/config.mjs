// Configuração comum dos testes ponta a ponta. Tudo pode ser trocado por variável de ambiente;
// os valores padrão são os do ambiente local de teste (ver e2e/README.md).
import { existsSync } from 'node:fs';

const env = process.env;
export const CLI = env.VM_URL_CLIENTE || 'http://localhost:4173';   // app do cliente
export const PAR = env.VM_URL_PARCEIRO || 'http://localhost:4174';  // painel do comerciante
export const ADM = env.VM_URL_ADMIN || 'http://localhost:4175';     // painel admin
export const API = env.VM_URL_API || 'http://localhost:54321';      // API de teste (server.mjs)
export const PG = {
  host: env.VM_PG_HOST || 'localhost',
  port: Number(env.VM_PG_PORT || 54329),
  user: 'postgres',
  password: env.VM_PG_PASSWORD || 'postgres',
  database: env.VM_DB || 'vm',
};
// Chromium: VM_CHROMIUM, ou o do ambiente local, ou o que o Playwright instalou (npx playwright install chromium).
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = env.VM_CHROMIUM || (existsSync(localChromium) ? localChromium : undefined);
// Sem caminho fixo, usa o Chromium completo (channel 'chromium'), não o 'headless shell': o teste do aviso
// (service worker e notificações) precisa do navegador completo.
export const launchOptions = { ...(executablePath ? { executablePath } : { channel: 'chromium' }), args: ['--no-proxy-server'] };
