/**
 * Shared config loader — reads config.env
 */
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config.env');

function loadConfig() {
  const config = {
    chains: null,      // null = all chains, or array of filter strings
    whitelist: new Set(),
  };

  if (!fs.existsSync(CONFIG_FILE)) return config;

  const content = fs.readFileSync(CONFIG_FILE, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();

    if (key === 'CHAINS' && val) {
      config.chains = val.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    }

    if (key === 'WHITELIST' && val) {
      const addrs = val.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      for (const addr of addrs) {
        config.whitelist.add(addr);
      }
    }
  }

  return config;
}

function isWhitelisted(address, whitelist) {
  if (!whitelist || whitelist.size === 0) return false;
  return whitelist.has(address.toLowerCase());
}

module.exports = { loadConfig, isWhitelisted };
