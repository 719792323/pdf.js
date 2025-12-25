#!/bin/bash

# 创建 PID 文件目录
PID_FILE="/Users/songji/Code/JS/pdf.js/.pids"

# 启动 gulp server 并记录 PID
npx gulp server &
GULP_PID=$!
echo "gulp_pid=$GULP_PID" > "$PID_FILE"

# 启动 python 脚本并记录 PID
python doubao_helper.py &
PYTHON_PID=$!
echo "python_pid=$PYTHON_PID" >> "$PID_FILE"

echo "服务已启动："
echo "  - gulp server PID: $GULP_PID"
echo "  - doubao_helper.py PID: $PYTHON_PID"
echo "使用 ./stop.sh 关闭服务"