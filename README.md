# EVM Multi-Chain Wallet Balance Scanner

生成钱包地址，遍历 40+ 条 EVM 兼容链检查余额。

## 项目结构

```
eth-scanner/
├── chains.js           # 链配置（RPC、chainId、代币符号）
├── scanner.js          # 逐钱包扫描（详细输出，显示每条链结果）
├── batch-scanner.js    # 批量扫描（JSON-RPC batch，高速）
├── package.json
└── README.md
```

## 快速开始

```bash
npm install

# 扫描 10 个随机钱包（默认）
node scanner.js

# 扫描 100 个随机钱包，只查 ETH/BSC/Polygon
node scanner.js random -n 100 -c eth,bsc,polygon

# 扫描 hex range 0x1 到 0xFFFF 的私钥
node scanner.js range --start 0x1 --end 0xFFFF

# 从文件读取地址
node scanner.js file -i addresses.txt

# 批量模式（高速，适合 100+ 地址）
node batch-scanner.js -n 1000
node batch-scanner.js -n 500 -c eth,bsc,arbitrum,base -o results.json
```

## 两种扫描器对比

| 特性 | scanner.js | batch-scanner.js |
|------|-----------|-----------------|
| 速度 | ~0.1 wallets/s | ~60+ wallets/s |
| 输出 | 每条链详细显示 | 只显示有余额的 |
| 适用 | 小批量、调试 | 大批量扫描 |
| 原理 | 逐个 eth_getBalance | JSON-RPC batch |

## 支持的链（40+）

Ethereum, Arbitrum, Optimism, Base, Linea, zkSync Era, Scroll, Blast, Mantle,
Mode, Zora, opBNB, Polygon, BNB Chain, Avalanche, Fantom, Cronos, Gnosis,
Celo, Moonbeam, Moonriver, Aurora, Harmony, Klaytn, Meter, Syscoin, Telos,
WEMIX, EthereumPoW, SmartBCH, Polygon zkEVM, Sei, Taiko, Manta Pacific,
Gravity, WorldChain, Abstract, Soneium, Ink, Unichain, Corn + testnets

## 参数说明

```
-n, --count N        随机生成钱包数量（默认 10）
-c, --chains LIST    逗号分隔的链名筛选（e.g. eth,bsc,polygon）
--start HEX          range 模式起始 hex
--end HEX            range 模式结束 hex
-i, --input FILE     从文件读取地址（每行一个，或 CSV）
-o, --output FILE    结果保存为 JSON
--concurrency N      并行 RPC 数（默认 5）
--timeout MS         单链 RPC 超时（默认 8000ms）
--testnets           包含测试网
--batch-size N       批量模式每批地址数（默认 20）
```

## 注意事项

- 随机私钥找到有余额地址的概率接近于零（2^256 种可能）
- 部分 RPC 可能因限流返回错误，脚本有自动重试
- 大量扫描建议用 batch-scanner.js，速度差距巨大
- 可自行在 chains.js 中添加更多链的 RPC 地址
