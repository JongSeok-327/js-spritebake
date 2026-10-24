import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogs } from '../dist/i18n.js';

test('all UI languages cover every message and preserve interpolation arguments', async () => {
  const keys = Object.keys(catalogs.en).sort();
  for (const [language, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(catalog).sort(), keys, language);
    for (const key of keys) {
      assert.ok(catalog[key].trim(), `${language}:${key} is empty`);
      const placeholders = value => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
      assert.deepEqual(placeholders(catalog[key]), placeholders(catalogs.en[key]), `${language}:${key}`);
    }
  }
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) {
    assert.ok(Object.hasOwn(catalogs.en, key), `Unknown HTML translation ${key}`);
  }
});
