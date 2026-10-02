#!/bin/zsh -l

# Login shell loads the same Node.js environment as Terminal.
cd -- "${0:A:h}" || exit 1

fail() {
  print -u2 -- "$1"
  if [[ -t 0 ]]; then
    read "?按回车键关闭窗口…"
  fi
  exit 1
}

command -v node >/dev/null 2>&1 || fail "未找到 Node.js，请先安装 Node.js 22 或更高版本。"
command -v npm >/dev/null 2>&1 || fail "未找到 npm，请检查 Node.js 安装。"
[[ -d node_modules ]] || fail "尚未安装依赖，请在项目目录执行 npm ci，并按 README 完成首次构建。"

launch_port=${AI_CREW_BFF_PORT:-4174}
existing_pid=$(lsof -nP -tiTCP:"${launch_port}" -sTCP:LISTEN 2>/dev/null | head -n 1)
[[ -z "${existing_pid}" ]] || fail "端口 ${launch_port} 已被进程 ${existing_pid} 占用。若是旧 AI Crew 服务，请在旧终端按 Ctrl+C 后重新启动。"

local_python="${PWD}/.venv/bin/python"
[[ -x "${local_python}" ]] || fail "未找到项目内的 .venv/bin/python；请在项目目录执行 python3.14 -m venv .venv。"
python_version=$("${local_python}" --version 2>&1) || fail "无法运行项目内的 .venv/bin/python；请用 Python 3.14 重建虚拟环境。"
[[ "${python_version}" == "Python 3.14."* ]] || fail "项目虚拟环境当前为 ${python_version}；请用 Python 3.14 重建 .venv。"
export AI_CREW_PYTHON="${local_python}"
export AI_CREW_CLI="${AI_CREW_CLI:-${HOME}/.codex/skills/ai-crew/scripts/ai_crew.py}"
[[ -f "${AI_CREW_CLI}" ]] || fail "未找到 ai-crew CLI：${AI_CREW_CLI}；请安装 ai-crew skill，或设置 AI_CREW_CLI 为脚本的完整路径。"

# The build applies the AI Crew overlay and the Mattermost Sass compatibility fix.
print -- "正在应用定制并构建最新的 Mattermost 与 Multica 页面，请稍候…"
npm run build:mattermost || fail "页面构建失败，未启动旧版本服务；请查看上方构建错误。"

print -- "正在启动 AI Crew 服务…"
print -- "启动成功后访问：http://127.0.0.1:${AI_CREW_BFF_PORT:-4174}/ai-crew"
print -- "请保持此窗口打开；按 Ctrl+C 停止服务。"
print

npm start
launch_status=$?
if (( launch_status != 0 && launch_status != 130 )); then
  fail "服务已退出（退出码：${launch_status}），请查看上方错误信息。"
fi
