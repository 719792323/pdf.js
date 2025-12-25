#!/bin/bash

PID_FILE="/Users/songji/Code/JS/pdf.js/.pids"

echo "正在关闭服务..."

# 方法1: 通过 PID 文件关闭
if [ -f "$PID_FILE" ]; then
    source "$PID_FILE"

    # 关闭 gulp server
    if [ -n "$gulp_pid" ] && kill -0 "$gulp_pid" 2>/dev/null; then
        kill "$gulp_pid" 2>/dev/null
        echo "  - gulp server (PID: $gulp_pid) 已关闭"
    fi

    # 关闭 python 脚本
    if [ -n "$python_pid" ] && kill -0 "$python_pid" 2>/dev/null; then
        kill "$python_pid" 2>/dev/null
        echo "  - doubao_helper.py (PID: $python_pid) 已关闭"
    fi

    rm -f "$PID_FILE"
fi

# 方法2: 通过端口强制关闭 (确保 Flask 完全关闭)
# 关闭占用 19527 端口的进程 (doubao_helper.py)
FLASK_PIDS=$(lsof -ti:19527 2>/dev/null)
if [ -n "$FLASK_PIDS" ]; then
    echo "$FLASK_PIDS" | xargs kill -9 2>/dev/null
    echo "  - 已关闭占用端口 19527 的进程"
fi

# 关闭占用 8888 端口的进程 (gulp server 默认端口)
GULP_PIDS=$(lsof -ti:8888 2>/dev/null)
if [ -n "$GULP_PIDS" ]; then
    echo "$GULP_PIDS" | xargs kill -9 2>/dev/null
    echo "  - 已关闭占用端口 8888 的进程"
fi

echo "所有服务已关闭"
