// Opcoes que o dono muda pelo painel do site (settings.json no repositorio).
// No GitHub Actions o bot rele o arquivo pela API a cada minuto: muda sem reiniciar.
import fs from 'node:fs';

export const DEFAULTS = { privateChats: false };
export const settings = { ...DEFAULTS };

function apply(obj) { for (const k of Object.keys(DEFAULTS)) if (typeof obj?.[k] === typeof DEFAULTS[k]) settings[k] = obj[k]; }

export async function refreshSettings() {
  try {
    const repo = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN;
    if (repo && token) {
      const r = await fetch(`https://api.github.com/repos/${repo}/contents/settings.json?ref=main`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json' }, signal: AbortSignal.timeout(15000) });
      if (r.ok) return apply(await r.json());
    }
    if (fs.existsSync('settings.json')) apply(JSON.parse(fs.readFileSync('settings.json', 'utf8')));
  } catch (e) { if (process.env.DEBUG) console.warn('settings:', e.message); }
}
await refreshSettings();
setInterval(refreshSettings, 60_000).unref();
