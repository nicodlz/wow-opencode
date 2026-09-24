'use strict';

class ModelCatalog {
  constructor(client) { this.client = client; }

  async catalog(directory) {
    const data = await this.client.request('/provider', directory);
    if (!Array.isArray(data?.all) || !Array.isArray(data?.connected)) throw new Error('OpenCode /provider did not return the connected model catalog.');
    return data.all.filter(provider => data.connected.includes(provider.id));
  }

  async providers(directory) {
    const providers = await this.catalog(directory);
    return providers.map(provider => ({ name: provider.name || provider.id, value: provider.id, count: Object.keys(provider.models || {}).length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async models(directory, providerID, page = 1) {
    const providers = await this.catalog(directory);
    const provider = providers.find(p => p.id === providerID);
    if (!provider) throw new Error(`Provider ${providerID} is not connected to OpenCode.`);
    const models = Object.entries(provider.models || {}).map(([key, info]) => ({
      name: info.name || info.id || key,
      value: `${provider.id}/${info.id || key}`,
      reasoning: Object.keys(info.variants || {}).length > 0,
    })).sort((a, b) => a.name.localeCompare(b.name) || a.value.localeCompare(b.value));
    const pages = Math.max(1, Math.ceil(models.length / 10));
    if (!Number.isInteger(page) || page < 1 || page > pages) throw new Error('Invalid model page.');
    return { name: provider.name || provider.id, provider: providerID, page, pages, items: models.slice((page - 1) * 10, page * 10) };
  }

  async variants(directory, id) {
    const providers = await this.catalog(directory);
    const provider = providers.find(p => id.startsWith(`${p.id}/`));
    const modelID = provider && id.slice(provider.id.length + 1);
    const model = provider && Object.values(provider.models || {}).find(m => m.id === modelID);
    if (!model) throw new Error(`Model ${id} is not available from a connected provider.`);
    return {
      model: id,
      name: model.name || modelID,
      items: [{ name: 'Default (no variant)', value: '' },
        ...Object.keys(model.variants || {}).sort().map(value => ({ name: value, value }))],
    };
  }

  async validate(directory, id, variant = '') {
    const model = await this.variants(directory, id);
    if (!model.items.some(item => item.value === variant)) throw new Error(`Reasoning level ${variant} is unavailable for ${id}.`);
    return model;
  }
}

module.exports = { ModelCatalog };
