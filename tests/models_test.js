'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ModelCatalog } = require('../bridge/models');
const { OpenCode } = require('../bridge/opencode');
const { mockOpenCode } = require('./mock_opencode');

test('connected providers, model pagination and per-model reasoning variants', async t => {
  const api = await mockOpenCode(t, { providers: {
    all: [
      { id: 'one', name: 'One', models: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`model-${i}`, {
        id: `model-${i}`, name: `Name ${String(i).padStart(2, '0')}`, variants: i === 12 ? { low: {}, high: {} } : {},
      }])) },
      { id: 'unavailable', name: 'No credentials', models: { 'secret': { id: 'secret', variants: {} } } },
    ], connected: ['one'], default: { one: 'model-12' },
  } });
  const models = new ModelCatalog(new OpenCode({ serverUrl: api.url }, {}));
  assert.deepEqual((await models.providers('/project')).map(p => p.value), ['one']);
  assert.equal((await models.models('/project', 'one', 1)).items.length, 10);
  const page = await models.models('/project', 'one', 2);
  assert.equal(page.items.length, 3);
  assert.equal(page.pages, 2);
  assert.deepEqual((await models.variants('/project', 'one/model-12')).items.map(v => v.value), ['', 'high', 'low']);
  await models.validate('/project', 'one/model-12', 'high');
  await assert.rejects(models.validate('/project', 'one/model-1', 'high'), /unavailable/);
  await assert.rejects(models.variants('/project', 'unavailable/secret'), /not available/);
  await assert.rejects(models.models('/project', 'one', 99), /Invalid model page/);
  assert.ok(api.calls.filter(c => c.route === '/provider').every(c => c.directory === '/project'));
});
