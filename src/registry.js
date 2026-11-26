// Registro de comandos. Cada modulo em src/commands exporta `commands: Command[]`.
// Command = { name, aliases?, category, react?, done?, admin?, botAdmin?, owner?, hidden?, run(ctx) }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const registry = new Map();
export const list = [];

export async function loadCommands() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'commands');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    for (const c of mod.commands || []) {
      if (registry.has(c.name)) throw new Error(`Comando duplicado: ${c.name} (${f})`);
      c.file = f;
      list.push(c);
      for (const n of [c.name, ...(c.aliases || [])]) registry.set(n.toLowerCase(), c);
    }
  }
  return list;
}
