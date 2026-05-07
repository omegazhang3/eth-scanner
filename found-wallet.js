/**
 * Save found wallet (with balance) to file
 * Append mode — each discovery is a new entry
 */
const fs = require('fs');
const path = require('path');

const FOUND_DIR = path.join(__dirname, 'found');
const FOUND_FILE = path.join(FOUND_DIR, 'found-wallets.md');

function ensureFoundDir() {
  if (!fs.existsSync(FOUND_DIR)) {
    fs.mkdirSync(FOUND_DIR, { recursive: true });
  }
}

/**
 * Save a found wallet to the markdown file
 * @param {Object} wallet - { address, privateKey, mnemonic }
 * @param {Array} balances - [{ chain, chainId, symbol, balance, balanceWei }]
 */
function saveFoundWallet(wallet, balances) {
  ensureFoundDir();

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const nonZero = balances.filter(b => b.balanceWei && b.balanceWei !== '0');

  let entry = `\n---\n\n`;
  entry += `## Found: ${now}\n\n`;
  entry += `| Field | Value |\n|-------|-------|\n`;
  entry += `| Address | \`${wallet.address}\` |\n`;
  if (wallet.privateKey) {
    entry += `| Private Key | \`${wallet.privateKey}\` |\n`;
  }
  if (wallet.mnemonic) {
    entry += `| Mnemonic | \`${wallet.mnemonic}\` |\n`;
  }
  entry += `\n`;
  entry += `### Balances\n\n`;
  entry += `| Network | Coin | Chain ID | Balance | Contract |\n`;
  entry += `|---------|------|----------|---------|----------|\n`;

  for (const b of nonZero) {
    const contract = 'Native'; // native token
    entry += `| ${b.chain} | ${b.symbol} | ${b.chainId} | ${b.balance} | ${contract} |\n`;
  }
  entry += `\n`;

  // Also save as JSON for programmatic access
  const jsonEntry = {
    timestamp: new Date().toISOString(),
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic || null,
    balances: nonZero.map(b => ({
      chain: b.chain,
      chainId: b.chainId,
      symbol: b.symbol,
      balance: b.balance,
      balanceWei: b.balanceWei,
      contract: 'native',
    })),
  };

  // Append to markdown
  fs.appendFileSync(FOUND_FILE, entry);

  // Append to JSON lines file
  const jsonFile = path.join(FOUND_DIR, 'found-wallets.jsonl');
  fs.appendFileSync(jsonFile, JSON.stringify(jsonEntry) + '\n');

  return FOUND_FILE;
}

module.exports = { saveFoundWallet, FOUND_DIR, FOUND_FILE };
