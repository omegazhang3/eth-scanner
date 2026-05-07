#!/usr/bin/env node
/**
 * Multi-chain EVM Wallet Balance Scanner
 *
 * Modes:
 *   random   - Generate random wallets and check balances (default)
 *   range    - Scan a range of sequential private keys (hex range)
 *   file     - Check addresses from a file (one per line, or CSV with address,balance)
 *
 * Usage:
 *   node scanner.js                          # random mode, 10 wallets
 *   node scanner.js random --count 100       # scan 100 random wallets
 *   node scanner.js range --start 0x1 --end 0x1000
 *   node scanner.js file --input addresses.txt
 *   node scanner.js --chains eth,bsc,polygon # only specific chains
 *   node scanner.js --testnets               # include testnets
 *   node scanner.js --concurrency 10         # parallel chain checks
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { CHAINS } = require('./chains');
const { loadConfig, isWhitelisted } = require('./config-loader');
const { saveFoundWallet } = require('./found-wallet');

// ─── ANSI Colors ───
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed:   '\x1b[41m',
};

const log = console.log;
const timestamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ─── Config ───
const config = {
  mode: 'random',
  count: 10,
  concurrency: 5,        // parallel RPC calls per wallet
  timeout: 8000,          // per-chain RPC timeout (ms)
  startHex: '0x1',
  endHex: '0x1000',
  inputFile: null,
  includeTestnets: false,
  filterChains: null,     // null = all, or array of chain names (lowercase)
  outputFile: null,       // save results to file
  retries: 2,
};

// ─── Parse Args ───
function parseArgs() {
  const args = process.argv.slice(2);

  // First arg may be mode
  if (args[0] && !args[0].startsWith('-')) {
    config.mode = args[0];
  }

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--count': case '-n':
        config.count = parseInt(args[++i], 10) || 10;
        break;
      case '--start':
        config.startHex = args[++i];
        break;
      case '--end':
        config.endHex = args[++i];
        break;
      case '--input': case '-i':
        config.inputFile = args[++i];
        break;
      case '--testnets':
        config.includeTestnets = true;
        break;
      case '--chains': case '-c':
        config.filterChains = args[++i].split(',').map(s => s.trim().toLowerCase());
        break;
      case '--concurrency':
        config.concurrency = parseInt(args[++i], 10) || 5;
        break;
      case '--timeout':
        config.timeout = parseInt(args[++i], 10) || 8000;
        break;
      case '--output': case '-o':
        config.outputFile = args[++i];
        break;
      case '--retries':
        config.retries = parseInt(args[++i], 10) || 2;
        break;
      case '--help': case '-h':
        printHelp();
        process.exit(0);
    }
  }
}

function printHelp() {
  log(`
${C.bold}EVM Multi-Chain Wallet Scanner${C.reset}

${C.cyan}Usage:${C.reset}
  node scanner.js [mode] [options]

${C.cyan}Modes:${C.reset}
  random          Generate random wallets (default)
  range           Scan a range of sequential private keys
  file            Check addresses from a text file

${C.cyan}Options:${C.reset}
  -n, --count N       Number of random wallets to generate (default: 10)
  --start HEX         Range mode: start hex (default: 0x1)
  --end HEX           Range mode: end hex (default: 0x1000)
  -i, --input FILE    File mode: file with addresses (one per line)
  -c, --chains LIST   Comma-separated chain names to check (e.g. eth,bsc,polygon)
  --testnets          Include testnet chains
  --concurrency N     Parallel chain checks per wallet (default: 5)
  --timeout MS        RPC timeout in ms (default: 8000)
  --retries N         Retry count per chain (default: 2)
  -o, --output FILE   Save results to JSON file
  -h, --help          Show this help

${C.cyan}Examples:${C.reset}
  node scanner.js random -n 100
  node scanner.js range --start 0x1 --end 0xFFFF
  node scanner.js file -i wallets.txt -c eth,bsc,polygon
  node scanner.js --chains arbitrum,base,optimism -n 50
`);
}

// ─── Chain Filtering ───
function getActiveChains() {
  let chains = CHAINS;
  if (!config.includeTestnets) {
    chains = chains.filter(c => !c.testnet);
  }
  if (config.filterChains) {
    chains = chains.filter(c => {
      const lower = c.name.toLowerCase();
      const aliases = (c.aliases || []).map(a => a.toLowerCase());
      return config.filterChains.some(f => lower.includes(f) || lower === f || aliases.includes(f));
    });
  }
  return chains;
}

// ─── Core: Check balance on a single chain ───
async function checkBalanceOnChain(chain, address) {
  const provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId, {
    staticNetwork: true,
    batchStallTime: 0,
  });

  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const balance = await provider.getBalance(address);
      clearTimeout(timeoutId);

      return {
        chain: chain.name,
        chainId: chain.chainId,
        symbol: chain.symbol,
        balance: ethers.formatEther(balance),
        balanceWei: balance.toString(),
        error: null,
      };
    } catch (err) {
      if (attempt === config.retries) {
        return {
          chain: chain.name,
          chainId: chain.chainId,
          symbol: chain.symbol,
          balance: '0',
          balanceWei: '0',
          error: err.message.slice(0, 80),
        };
      }
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

// ─── Core: Check one wallet across all chains ───
async function checkWallet(address, label, chains) {
  const results = [];

  // Process chains in batches for concurrency control
  for (let i = 0; i < chains.length; i += config.concurrency) {
    const batch = chains.slice(i, i + config.concurrency);
    const batchResults = await Promise.all(
      batch.map(chain => checkBalanceOnChain(chain, address))
    );
    results.push(...batchResults);
  }

  return results;
}

// ─── Find balances > 0 ───
function filterNonZero(results) {
  return results.filter(r => r.balanceWei !== '0' && r.balance !== '0.0');
}

// ─── Output ───
function printWalletResult(address, privateKey, results, index, total) {
  const nonZero = filterNonZero(results);
  const errors = results.filter(r => r.error);

  log('');
  log(`${C.bold}${'═'.repeat(72)}${C.reset}`);
  log(`${C.cyan}[${index + 1}/${total}]${C.reset} ${C.bold}Wallet${C.reset}`);
  log(`${C.dim}Address:${C.reset}     ${C.white}${address}${C.reset}`);
  if (privateKey) {
    log(`${C.dim}Private Key:${C.reset} ${C.yellow}${privateKey}${C.reset}`);
  }

  if (nonZero.length > 0) {
    log(`${C.bold}${C.bgGreen} 🎉 BALANCE FOUND! ${C.reset}`);
    for (const r of nonZero) {
      log(`  ${C.green}✓${C.reset} ${r.chain} (${r.symbol}): ${C.bold}${C.green}${r.balance}${C.reset} ${r.symbol}`);
    }
  } else {
    log(`${C.dim}  No balances found across ${results.length - errors.length} chains.${C.reset}`);
  }

  if (errors.length > 0) {
    log(`${C.dim}  ${errors.length} chain(s) unreachable (RPC timeout/error).${C.reset}`);
  }
}

// ─── Modes ───

async function* generateRandomWallets(count) {
  for (let i = 0; i < count; i++) {
    const wallet = ethers.Wallet.createRandom();
    yield {
      index: i,
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic ? wallet.mnemonic.phrase : null,
      label: `random-${i}`,
    };
  }
}

async function* generateRangeWallets(startHex, endHex) {
  let current = BigInt(startHex);
  const end = BigInt(endHex);
  let index = 0;

  while (current <= end) {
    const pk = '0x' + current.toString(16).padStart(64, '0');
    try {
      const wallet = new ethers.Wallet(pk);
      yield {
        index: index++,
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: null,
        label: `range-${current.toString(16)}`,
      };
    } catch {
      // skip invalid keys
    }
    current++;
  }
}

async function* generateFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Support CSV: address,balance or private_key,address
    const parts = line.split(/[,\t]/).map(s => s.trim());
    let address = null;
    let privateKey = null;

    for (const part of parts) {
      if (/^0x[0-9a-fA-F]{40}$/.test(part)) {
        address = part;
      } else if (/^0x[0-9a-fA-F]{64}$/.test(part)) {
        privateKey = part;
        try {
          const wallet = new ethers.Wallet(part);
          address = wallet.address;
        } catch {}
      } else if (/^0x[0-9a-fA-F]{66}$/.test(part)) {
        privateKey = part;
        try {
          const wallet = new ethers.Wallet(part);
          address = wallet.address;
        } catch {}
      }
    }

    // If line is just an address
    if (!address && /^0x[0-9a-fA-F]{40}$/i.test(line)) {
      address = line;
    }

    if (address) {
      yield {
        index: i,
        address: address,
        privateKey: privateKey,
        mnemonic: null,
        label: `file-${i}`,
      };
    } else {
      log(`${C.yellow}⚠ Skipping invalid line ${i + 1}: ${line.slice(0, 60)}${C.reset}`);
    }
  }
}

// ─── Main ───
async function main() {
  parseArgs();

  const appConfig = loadConfig();
  const whitelist = appConfig.whitelist;

  // Use config.env CHAINS as fallback if --chains not specified
  if (!config.filterChains && appConfig.chains) {
    config.filterChains = appConfig.chains;
  }
  const chains = getActiveChains();

  log(`${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.cyan}║      EVM Multi-Chain Wallet Balance Scanner         ║${C.reset}`);
  log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════╝${C.reset}`);
  log(`  ${C.dim}Time:${C.reset}         ${timestamp()}`);
  log(`  ${C.dim}Mode:${C.reset}         ${C.white}${config.mode}${C.reset}`);
  log(`  ${C.dim}Chains:${C.reset}       ${C.white}${chains.length} networks${C.reset}`);
  log(`  ${C.dim}Concurrency:${C.reset}  ${C.white}${config.concurrency} parallel RPCs${C.reset}`);
  log(`  ${C.dim}Timeout:${C.reset}      ${C.white}${config.timeout}ms${C.reset}`);

  if (config.mode === 'random') {
    log(`  ${C.dim}Count:${C.reset}        ${C.white}${config.count} wallets${C.reset}`);
  } else if (config.mode === 'range') {
    log(`  ${C.dim}Range:${C.reset}        ${C.white}${config.startHex} → ${config.endHex}${C.reset}`);
  } else if (config.mode === 'file') {
    log(`  ${C.dim}File:${C.reset}         ${C.white}${config.inputFile}${C.reset}`);
  }

  log(`\n  ${C.dim}Chain list:${C.reset}`);
  for (const c of chains) {
    log(`    ${C.dim}• ${c.name} (${c.symbol})${C.reset}`);
  }

  if (whitelist.size > 0) {
    log(`  ${C.dim}Whitelist:${C.reset}      ${C.white}${whitelist.size} address(es) will be skipped${C.reset}`);
  }
  log(`\n${'─'.repeat(72)}`);

  // Pick generator
  let generator;
  let totalEstimate = config.count;

  switch (config.mode) {
    case 'random':
      generator = generateRandomWallets(config.count);
      break;
    case 'range':
      generator = generateRangeWallets(config.startHex, config.endHex);
      totalEstimate = Number(BigInt(config.endHex) - BigInt(config.startHex)) + 1;
      break;
    case 'file':
      if (!config.inputFile) {
        log(`${C.red}Error: --input FILE required for file mode${C.reset}`);
        process.exit(1);
      }
      generator = generateFromFile(config.inputFile);
      break;
    default:
      log(`${C.red}Unknown mode: ${config.mode}${C.reset}`);
      process.exit(1);
  }

  const allResults = [];
  const foundWallets = [];
  let processed = 0;

  const startTime = Date.now();

  for await (const wallet of generator) {
    // Skip whitelisted addresses
    if (isWhitelisted(wallet.address, whitelist)) {
      log(`\n${C.yellow}[${wallet.index + 1}/${totalEstimate}] SKIPPED (whitelisted):${C.reset} ${C.dim}${wallet.address}${C.reset}`);
      processed++;
      continue;
    }
    const results = await checkWallet(wallet.address, wallet.label, chains);
    const nonZero = filterNonZero(results);

    printWalletResult(wallet.address, wallet.privateKey, results, wallet.index, totalEstimate);

    processed++;

    const record = {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic,
      balances: results,
      nonZero: nonZero,
    };
    allResults.push(record);

    if (nonZero.length > 0) {
      foundWallets.push(record);
      saveFoundWallet(wallet, nonZero);
    }

    // Progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const eta = (totalEstimate - processed) / rate;
    log(`${C.dim}  Progress: ${processed}/${totalEstimate} | Speed: ${rate.toFixed(1)} wallets/s | ETA: ${Math.ceil(eta)}s${C.reset}`);
  }

  // ─── Summary ───
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  log(`\n${'═'.repeat(72)}`);
  log(`${C.bold}${C.cyan}SCAN COMPLETE${C.reset}`);
  log(`  Wallets scanned:  ${processed}`);
  log(`  Chains per wallet:${chains.length}`);
  log(`  Total RPC calls:  ${processed * chains.length}`);
  log(`  Time elapsed:     ${elapsed}s`);
  log(`  Found with balance:${C.bold} ${foundWallets.length}${C.reset}`);

  if (foundWallets.length > 0) {
    log(`\n${C.bgGreen}${C.bold} WALLETS WITH BALANCE ${C.reset}`);
    for (const w of foundWallets) {
      log(`\n  Address: ${C.white}${w.address}${C.reset}`);
      if (w.privateKey) log(`  Key:     ${C.yellow}${w.privateKey}${C.reset}`);
      for (const b of w.nonZero) {
        log(`    ${C.green}✓${C.reset} ${b.chain}: ${C.bold}${b.balance} ${b.symbol}${C.reset}`);
      }
    }
  }

  // Save to file
  if (config.outputFile) {
    const output = {
      timestamp: new Date().toISOString(),
      config: { ...config },
      chains: chains.map(c => c.name),
      processed,
      found: foundWallets.length,
      elapsed: parseFloat(elapsed),
      results: allResults,
      foundWallets,
    };
    fs.writeFileSync(config.outputFile, JSON.stringify(output, null, 2));
    log(`\n  ${C.dim}Results saved to: ${config.outputFile}${C.reset}`);
  }

  if (foundWallets.length > 0) {
    log(`\n${C.bgGreen}${C.bold} 🎉 FOUND ${foundWallets.length} WALLET(S) WITH BALANCE! ${C.reset}`);
  } else {
    log(`\n${C.dim}No wallets with balance found. This is expected — the probability is astronomically low.${C.reset}`);
  }
}

main().catch(err => {
  log(`${C.red}Fatal error: ${err.message}${C.reset}`);
  process.exit(1);
});
