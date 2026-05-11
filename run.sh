#!/bin/bash
# 持续运行 EVM 批量扫描器
# 用法: ./run.sh [扫描次数] [每轮数量]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

# 单一日志文件
LOG_FILE="$LOG_DIR/scan.log"
RESULT_FILE="$LOG_DIR/results.json"

# 默认参数
COUNT=${1:-10000}
ROUNDS=${2:-0}  # 0 = 无限循环
CHAINS="eth,bsc,polygon,arbitrum,base,optimism,avalanche"
BATCH_SIZE=50
CONCURRENCY=10
TIMEOUT=10000

# 统计
total_rounds=0
total_found=0
start_time=$(date +%s)

# 信号处理
trap 'echo -e "\n\n🛑 停止扫描..."; echo "总轮次: $total_rounds | 总发现: $total_found"; exit 0' INT TERM

echo "🚀 EVM 持续扫描器启动"
echo "   钱包/轮: $COUNT"
echo "   链: $CHAINS"
echo "   批大小: $BATCH_SIZE | 并发: $CONCURRENCY"
[ "$ROUNDS" -gt 0 ] && echo "   总轮次: $ROUNDS" || echo "   模式: 无限循环 (Ctrl+C 停止)"
echo "   日志: $LOG_FILE"
echo "────────────────────────────────────────"

while true; do
    total_rounds=$((total_rounds + 1))

    echo "" >> "$LOG_FILE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 第 $total_rounds 轮开始" >> "$LOG_FILE"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 第 $total_rounds 轮开始 $(date '+%H:%M:%S')"

    # 运行扫描器
    cd "$SCRIPT_DIR"
    node batch-scanner.js \
        -n "$COUNT" \
        -c "$CHAINS" \
        --batch-size "$BATCH_SIZE" \
        --concurrency "$CONCURRENCY" \
        --timeout "$TIMEOUT" \
        -o "$RESULT_FILE" \
        2>&1 | tee -a "$LOG_FILE"

    exit_code=${PIPESTATUS[0]}

    # 统计本轮发现
    if [ -f "$RESULT_FILE" ]; then
        found=$(grep -o '"found": [0-9]*' "$RESULT_FILE" | grep -o '[0-9]*')
        total_found=$((total_found + found))
        if [ "$found" -gt 0 ]; then
            echo "🎉 本轮发现 $found 个有钱包!"
            echo "[$(date '+%H:%M:%S')] 发现 $found 个有钱包!" >> "$LOG_FILE"
        fi
    fi

    # 计算运行时间
    elapsed=$(( $(date +%s) - start_time ))
    hours=$((elapsed / 3600))
    minutes=$(( (elapsed % 3600) / 60 ))

    echo "✅ 第 $total_rounds 轮完成 | 累计: ${hours}h${minutes}m | 发现: $total_found"
    echo "[$(date '+%H:%M:%S')] 轮次完成 | 累计发现: $total_found" >> "$LOG_FILE"

    # 检查是否达到轮次限制
    if [ "$ROUNDS" -gt 0 ] && [ "$total_rounds" -ge "$ROUNDS" ]; then
        echo ""
        echo "🏁 已完成 $ROUNDS 轮扫描"
        echo "   总发现: $total_found"
        echo "   总耗时: ${hours}h${minutes}m"
        exit 0
    fi

    # 短暂休息避免 RPC 限流
    sleep 2
done
