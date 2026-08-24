import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/** Load frontend/.env.local then .env without printing values. */
export function loadFrontendEnv(): void {
  const cwd = process.cwd();
  for (const name of ['.env.local', '.env']) {
    const file = resolve(cwd, name);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
