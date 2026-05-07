// EVM-compatible chain configurations
// Free public RPC endpoints (no API key required)
const CHAINS = [
  // === Ethereum & L2 ===
  { name: 'Ethereum',        chainId: 1,      symbol: 'ETH',  rpc: 'https://eth.llamarpc.com' },
  { name: 'Arbitrum One',    chainId: 42161,   aliases: ['arb', 'arbitrum'],   symbol: 'ETH',  rpc: 'https://arb1.arbitrum.io/rpc' },
  { name: 'Optimism',        chainId: 10,      symbol: 'ETH',  rpc: 'https://mainnet.optimism.io' },
  { name: 'Base',            chainId: 8453,    symbol: 'ETH',  rpc: 'https://mainnet.base.org' },
  { name: 'Linea',           chainId: 59144,   symbol: 'ETH',  rpc: 'https://rpc.linea.build' },
  { name: 'zkSync Era',      chainId: 324,     symbol: 'ETH',  rpc: 'https://mainnet.era.zksync.io' },
  { name: 'Scroll',          chainId: 534352,  symbol: 'ETH',  rpc: 'https://rpc.scroll.io' },
  { name: 'Blast',           chainId: 81457,   symbol: 'ETH',  rpc: 'https://rpc.blast.io' },
  { name: 'Mantle',          chainId: 5000,    symbol: 'MNT',  rpc: 'https://rpc.mantle.xyz' },
  { name: 'Mode',            chainId: 34443,   symbol: 'ETH',  rpc: 'https://mainnet.mode.network' },
  { name: 'Zora',            chainId: 7777777, symbol: 'ETH',  rpc: 'https://rpc.zora.energy' },
  { name: 'opBNB',           chainId: 204,     symbol: 'BNB',  rpc: 'https://opbnb-mainnet-rpc.bnbchain.org' },

  // === Alternative L1 ===
  { name: 'Polygon',         chainId: 137,     aliases: ['matic'],     symbol: 'MATIC',rpc: 'https://polygon-rpc.com' },
  { name: 'BNB Chain',       chainId: 56,      aliases: ['bsc', 'binance'],      symbol: 'BNB',  rpc: 'https://bsc-dataseed1.binance.org' },
  { name: 'Avalanche C-Chain',chainId: 43114,  aliases: ['avax'],  symbol: 'AVAX', rpc: 'https://api.avax.network/ext/bc/C/rpc' },
  { name: 'Fantom',          chainId: 250,     aliases: ['ftm'],     symbol: 'FTM',  rpc: 'https://rpc.ftm.tools' },
  { name: 'Cronos',          chainId: 25,      symbol: 'CRO',  rpc: 'https://evm.cronos.org' },
  { name: 'Gnosis Chain',    chainId: 100,     symbol: 'xDAI', rpc: 'https://rpc.gnosischain.com' },
  { name: 'Celo',            chainId: 42220,   symbol: 'CELO', rpc: 'https://forno.celo.org' },
  { name: 'Moonbeam',        chainId: 1284,    symbol: 'GLMR', rpc: 'https://rpc.api.moonbeam.network' },
  { name: 'Moonriver',       chainId: 1285,    symbol: 'MOVR', rpc: 'https://rpc.api.moonriver.moonbeam.network' },
  { name: 'Aurora',          chainId: 1313161554,symbol:'ETH',  rpc: 'https://mainnet.aurora.dev' },
  { name: 'Harmony',         chainId: 1666600000,symbol:'ONE',  rpc: 'https://api.harmony.one' },
  { name: 'Klaytn',          chainId: 8217,    symbol: 'KLAY', rpc: 'https://public-en-cypress.klaytn.net' },
  { name: 'Meter',           chainId: 82,      symbol: 'MTR',  rpc: 'https://rpc.meter.io' },
  { name: 'Syscoin',         chainId: 57,      symbol: 'SYS',  rpc: 'https://rpc.syscoin.org' },
  { name: 'Telos',           chainId: 40,      symbol: 'TLOS', rpc: 'https://mainnet.telos.net/evm' },
  { name: 'WEMIX',           chainId: 1111,    symbol: 'WEMIX',rpc: 'https://api.wemix.com' },
  { name: 'EthereumPoW',     chainId: 10001,   symbol: 'ETHW', rpc: 'https://mainnet.ethereumpow.org' },
  { name: 'SmartBCH',        chainId: 10000,   symbol: 'BCH',  rpc: 'https://smartbch.greyh.at' },

  // === Polygon Ecosystem ===
  { name: 'Polygon zkEVM',   chainId: 1101,    symbol: 'ETH',  rpc: 'https://zkevm-rpc.com' },

  // === Newer Chains ===
  { name: 'Sei',             chainId: 1329,    symbol: 'SEI',  rpc: 'https://evm-rpc.sei-apis.com' },
  { name: 'Taiko',           chainId: 167000,  symbol: 'ETH',  rpc: 'https://rpc.mainnet.taiko.xyz' },
  { name: 'Manta Pacific',   chainId: 169,     symbol: 'ETH',  rpc: 'https://pacific-rpc.manta.network/http' },
  { name: 'Gravity',         chainId: 1625,    symbol: 'G',    rpc: 'https://rpc.gravity.xyz' },
  { name: 'WorldChain',      chainId: 480,     symbol: 'ETH',  rpc: 'https://worldchain-mainnet.g.alchemy.com/public' },
  { name: 'Abstract',        chainId: 2741,    symbol: 'ETH',  rpc: 'https://api.mainnet.abs.xyz' },
  { name: 'Soneium',         chainId: 1868,    symbol: 'ETH',  rpc: 'https://rpc.soneium.org' },
  { name: 'Ink',             chainId: 57073,   symbol: 'ETH',  rpc: 'https://rpc-gel.inkonchain.com' },
  { name: 'Unichain',        chainId: 130,     symbol: 'ETH',  rpc: 'https://mainnet.unichain.org' },
  { name: 'Corn',            chainId: 21000000,symbol: 'BTCN', rpc: 'https://mainnet.corn-rpc.com' },

  // === Testnets (optional, comment out if not needed) ===
  { name: 'Sepolia',         chainId: 11155111,symbol: 'ETH',  rpc: 'https://rpc.sepolia.org', testnet: true },
  { name: 'Holesky',         chainId: 17000,   symbol: 'ETH',  rpc: 'https://ethereum-holesky-rpc.publicnode.com', testnet: true },
];

module.exports = { CHAINS };
