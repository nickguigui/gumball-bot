// Gera docs/commands.json a partir do registro real de comandos (para o site).
process.env.DATA_DIR = './data-test';
const { loadCommands, list } = await import('../src/registry.js');
const { MENU, MENU_ADM } = await import('../src/menu.js');
const fs = await import('node:fs');
await loadCommands();
const byName = Object.fromEntries(list.map(c => [c.name, c]));
const cats = [];
for (const [, groups] of MENU) for (const [cat, names] of groups) cats.push({ cat, cmds: names.split(' ').filter(n => byName[n] || list.some(c => c.aliases?.includes(n))) });
for (const [cat, names] of MENU_ADM) cats.push({ cat: cat + ' (admin)', cmds: names.split(' ').filter(n => byName[n] || list.some(c => c.aliases?.includes(n))) });
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/commands.json', JSON.stringify({ total: list.length, categories: cats }, null, 1));
console.log(`docs/commands.json: ${cats.length} categorias, ${cats.reduce((s, c) => s + c.cmds.length, 0)} entradas`);
