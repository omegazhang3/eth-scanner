#!/usr/bin/env node
/**
 * Batch Balance Scanner — High Throughput
 *
 * Uses JSON-RPC batch requests to check many addresses at once per chain.
 * Much faster than scanner.js when scanning 100+ addresses.
 *
 * Usage:
 *   node batch-scanner.js --count 1000
 *   node batch-scanner.js --count 500 -c eth,bsc,polygon,arbitrum
 *   node batch-scanner.js --input addresses.txt -o results.json
 */

const { ethers } = require('ethers');
const fs = require('fs');
const { CHAINS } = require('./chains');
const { loadConfig, isWhitelisted } = require('./config-loader');

// ─── ANSI Colors ───
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', white: '\x1b[37m', bgGreen: '\x1b[42m',
};
const log = console.log;

// ─── Config ───
const config = {
  count: 100,
  chains: null,
  includeTestnets: false,
  concurrency: 5,
  timeout: 10000,
  inputFile: null,
  outputFile: 'batch-results.json',
  batchSize: 20,       // addresses per batch RPC call
};

// ─── Parse Args ───
function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--count': case '-n':
        config.count = parseInt(args[++i], 10);
        break;
      case '-c': case '--chains':
        config.chains = args[++i].split(',').map(s => s.trim().toLowerCase());
        break;
      case '--testnets':
        config.includeTestnets = true;
        break;
      case '-i': case '--input':
        config.inputFile = args[++i];
        break;
      case '-o': case '--output':
        config.outputFile = args[++i];
        break;
      case '--concurrency':
        config.concurrency = parseInt(args[++i], 10);
        break;
      case '--batch-size':
        config.batchSize = parseInt(args[++i], 10);
        break;
      case '--timeout':
        config.timeout = parseInt(args[++i], 10);
        break;
      case '-h': case '--help':
        log(`Usage: node batch-scanner.js [options]
  -n, --count N        Number of random wallets (default: 100)
  -c, --chains LIST    Comma-separated chains (default: all)
  -i, --input FILE     File with addresses/keys (one per line)
  -o, --output FILE    Output JSON (default: batch-results.json)
  --batch-size N       RPC batch size (default: 20)
  --concurrency N      Parallel chains (default: 5)
  --timeout MS         RPC timeout (default: 10000)
  --testnets           Include testnets`);
        process.exit(0);
    }
  }
}

function getActiveChains() {
  let chains = CHAINS;
  if (!config.includeTestnets) chains = chains.filter(c => !c.testnet);
  if (config.chains) {
    chains = chains.filter(c => {
      const lower = c.name.toLowerCase();
      return config.chains.some(f => lower.includes(f));
    });
  }
  return chains;
}

// ─── Generate wallets ───
function generateWallets(count) {
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const w = ethers.Wallet.createRandom();
    wallets.push({
      index: i,
      address: w.address,
      privateKey: w.privateKey,
    });
  }
  return wallets;
}

function loadAddressesFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const wallets = [];
  const lines = content.split(/\r?\n/).filter(l => l.trim());

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim().split(/[,\t]/).map(s => s.trim());
    let address = null, privateKey = null;

    for (const part of line) {
      if (/^0x[0-9a-fA-F]{40}$/.test(part)) address = part;
      if (/^0x[0-9a-fA-F]{64,66}$/.test(part)) {
        privateKey = part;
        try { address = new ethers.Wallet(part).address; } catch {}
      }
    }
    if (!address && /^0x[0-9a-fA-F]{40}$/i.test(line[0])) address = line[0];
    if (address) wallets.push({ index: i, address, privateKey });
  }
  return wallets;
}

// ─── Batch balance check via raw JSON-RPC ───
async function batchGetBalances(chain, addresses) {
  const provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId, {
    staticNetwork: true,
  });

  // Build batch request: eth_getBalance for each address at "latest"
  // ethers v6 doesn't have built-in batch, so we do raw JSON-RPC
  const batch = addresses.map((addr, i) => ({
    jsonrpc: '2.0',
    id: i + 1,
    method: 'eth_getBalance',
    params: [addr, 'latest'],
  }));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    const resp = await fetch(chain.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const results = await resp.json();

    // Map id -> balance
    const balanceMap = {};
    if (Array.isArray(results)) {
      for (const r of results) {
        const idx = r.id - 1;
        if (r.result) {
          balanceMap[idx] = r.result; // hex wei
        } else {
          balanceMap[idx] = '0x0';
        }
      }
    }
    return balanceMap;
  } catch (err) {
    // Return all zeros on error
    const balanceMap = {};
    for (let i = 0; i < addresses.length; i++) balanceMap[i] = '0x0';
    balanceMap._error = err.message.slice(0, 100);
    return balanceMap;
  }
}

// ─── Parallel chain scanner ───
async function scanWalletsAcrossChains(wallets, chains) {
  const addressList = wallets.map(w => w.address);
  const allResults = []; // [{chain, symbol, balances: {addrIndex: hexWei}}]

  // Process chains in concurrency batches
  for (let i = 0; i < chains.length; i += config.concurrency) {
    const batch = chains.slice(i, i + config.concurrency);
    const results = await Promise.all(
      batch.map(async (chain) => {
        const balances = await batchGetBalances(chain, addressList);
        return {
          chain: chain.name,
          chainId: chain.chainId,
          symbol: chain.symbol,
          balances,
          error: balances._error || null,
        };
      })
    );
    allResults.push(...results);
  }

  return allResults;
}

// ─── Main ───
async function main() {
  parseArgs();

  const chains = getActiveChains();
  const appConfig = loadConfig();
  const whitelist = appConfig.whitelist;
  let wallets = config.inputFile
    ? loadAddressesFromFile(config.inputFile)
    : generateWallets(config.count);

  // Filter out whitelisted addresses
  const skipped = [];
  if (whitelist.size > 0) {
    const filtered = [];
    for (const w of wallets) {
      if (isWhitelisted(w.address, whitelist)) {
        skipped.push(w);
      } else {
        filtered.push(w);
      }
    }
    wallets = filtered;
  }

  log(`${C.bold}${C.cyan}════════════════════════════════════════════════${C.reset}`);
  log(`${C.bold}${C.cyan}  EVM Batch Balance Scanner${C.reset}`);
  log(`${C.bold}${C.cyan}════════════════════════════════════════════════${C.reset}`);
  log(`  Wallets:     ${wallets.length}`);
  log(`  Chains:      ${chains.length}`);
  log(`  Batch size:  ${config.batchSize}`);
  log(`  Concurrency: ${config.concurrency}`);
  if (skipped.length > 0) {
    log(`  Whitelist:   ${C.yellow}${skipped.length} address(es) skipped${C.reset}`);
  }
  log(`  Total RPC:   ${wallets.length * chains.length} calls (${Math.ceil(wallets.length / config.batchSize) * chains.length} batches)`);
  log('');

  // Split wallets into batches and process
  const found = [];
  const startTime = Date.now();

  for (let b = 0; b < wallets.length; b += config.batchSize) {
    const batch = wallets.slice(b, b + config.batchSize);
    const batchNum = Math.floor(b / config.batchSize) + 1;
    const totalBatches = Math.ceil(wallets.length / config.batchSize);

    process.stdout.write(`\r  ${C.cyan}[${batchNum}/${totalBatches}]${C.reset} Scanning batch of ${batch.length} addresses...`);

    const chainResults = await scanWalletsAcrossChains(batch, chains);

    // Check for non-zero balances
    for (let wi = 0; wi < batch.length; wi++) {
      const walletBalances = [];
      for (const cr of chainResults) {
        if (cr.error) continue;
        const hexBalance = cr.balances[wi] || '0x0';
        const weiBalance = BigInt(hexBalance);
        if (weiBalance > 0n) {
          walletBalances.push({
            chain: cr.chain,
            symbol: cr.symbol,
            balance: ethers.formatEther(weiBalance),
            wei: weiBalance.toString(),
          });
        }
      }

      if (walletBalances.length > 0) {
        const w = batch[wi];
        found.push({ ...w, balances: walletBalances });
        log(`\n  ${C.bgGreen}${C.bold} FOUND! ${C.reset} ${C.white}${w.address}${C.reset}`);
        for (const b of walletBalances) {
          log(`    ${C.green}✓${C.reset} ${b.chain}: ${C.bold}${b.balance} ${b.symbol}${C.reset}`);
        }
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  log(`\n\n${'═'.repeat(72)}`);
  log(`${C.bold}${C.cyan}SCAN COMPLETE${C.reset}`);
  log(`  Wallets scanned:   ${wallets.length}`);
  log(`  Chains checked:    ${chains.length}`);
  log(`  Time:              ${elapsed}s`);
  log(`  Speed:             ${(wallets.length / parseFloat(elapsed)).toFixed(1)} wallets/s`);
  log(`  Found with balance:${C.bold} ${found.length}${C.reset}`);

  if (found.length > 0) {
    log(`\n${C.bgGreen}${C.bold} WALLETS WITH BALANCE ${C.reset}`);
    for (const w of found) {
      log(`\n  ${C.white}${w.address}${C.reset}`);
      if (w.privateKey) log(`  PK: ${C.yellow}${w.privateKey}${C.reset}`);
      for (const b of w.balances) {
        log(`    ${b.chain}: ${C.green}${b.balance} ${b.symbol}${C.reset}`);
      }
    }
  }

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    wallets: wallets.length,
    chains: chains.length,
    elapsed: parseFloat(elapsed),
    found: found.length,
    foundWallets: found,
  };
  fs.writeFileSync(config.outputFile, JSON.stringify(output, null, 2));
  log(`\n  Results saved to: ${config.outputFile}`);
}

main().catch(err => {
  log(`\n${C.red}Fatal: ${err.message}${C.reset}`);
  process.exit(1);
});
