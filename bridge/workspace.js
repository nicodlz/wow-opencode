'use strict';

const path = require('node:path');

// Project paths belong to OpenCode, not to the OS running the game bridge.
class ServerPaths {
  constructor({ directory, home }) {
    if (typeof directory !== 'string' || typeof home !== 'string') throw new Error('OpenCode /path did not return its directory and home.');
    this.windows = /^[a-z]:[\\/]|^\\\\/i.test(directory) || /^[a-z]:[\\/]|^\\\\/i.test(home);
    this.path = this.windows ? path.win32 : path.posix;
    if (!this.path.isAbsolute(directory) || !this.path.isAbsolute(home)) throw new Error('OpenCode /path must return absolute server paths.');
    this.directory = this.path.normalize(directory);
    this.home = this.path.normalize(home);
  }

  resolve(raw, base = this.directory) {
    let value = String(raw || '').trim();
    if (/[\x00-\x1f\x7f]/.test(value)) throw new Error('Folder paths cannot contain control characters.');
    if (value === '~') value = this.home;
    else if (value.startsWith('~/') || (this.windows && value.startsWith('~\\'))) value = this.path.join(this.home, value.slice(2));
    else if (value.startsWith('~')) throw new Error('Use ~ or ~/folder for the OpenCode server account\'s home directory.');
    if (!this.windows && (/^[a-z]:/i.test(value) || value.startsWith('\\\\'))) {
      throw new Error('This OpenCode server uses Linux/POSIX paths. Enter a server path such as /home/user/project or ~/project, not a Windows path.');
    }
    if (this.windows && /^[a-z]:(?![\\/])/i.test(value)) throw new Error('Use an absolute server drive path, such as C:\\projects.');
    return this.path.resolve(base, value || '.');
  }

  same(a, b) {
    if (!a || !b) return false;
    try {
      const normalize = value => this.windows ? this.resolve(value).toLowerCase() : this.resolve(value);
      return normalize(a) === normalize(b);
    } catch { return false; }
  }

  parent(directory) { return this.path.dirname(directory); }
}

class ServerWorkspace {
  constructor(client, defaultCwd = '') {
    this.client = client;
    this.configuredCwd = defaultCwd;
  }

  async initialize() {
    if (this.paths) return;
    if (!this.initializing) this.initializing = (async () => {
      const paths = new ServerPaths(await this.client.request('/path'));
      const defaultDirectory = paths.resolve(this.configuredCwd);
      this.paths = paths;
      this.defaultDirectory = defaultDirectory;
    })().finally(() => { this.initializing = null; });
    await this.initializing;
  }

  async entries(directory) {
    const entries = await this.client.request('/file', directory, { query: { path: '.' } });
    if (!Array.isArray(entries)) throw new Error('OpenCode /file did not return a directory listing.');
    return entries;
  }

  async directory(raw) {
    await this.initialize();
    const target = this.paths.resolve(raw, this.defaultDirectory);
    const parent = this.paths.parent(target);
    // Some server versions return [] for a missing folder. Checking its parent
    // distinguishes a missing path or a file from an existing empty folder.
    const entries = await this.entries(parent);
    if (parent !== target && !entries.some(entry => entry.type === 'directory' &&
      this.paths.same(entry.absolute || this.paths.resolve(entry.path || entry.name, parent), target))) {
      throw new Error(`Folder not found or not accessible on the OpenCode server: ${target}`);
    }
    return target;
  }

  async folders(raw) {
    const directory = await this.directory(raw);
    const entries = await this.entries(directory);
    return {
      path: directory,
      parent: this.paths.parent(directory),
      items: entries.filter(entry => entry.type === 'directory' && !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(entry => ({ name: entry.name, value: this.paths.resolve(entry.absolute || entry.path || entry.name, directory) })),
    };
  }

  same(a, b) { return this.paths.same(a, b); }
}

module.exports = { ServerPaths, ServerWorkspace };
