#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")" && pwd)"
runtime_root="$project_root/.sonora-runtime"
model_root="$runtime_root/ACE-Step-1.5"
uv_bin="$runtime_root/bin/uv"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "The Sonora local music setup requires Apple Silicon macOS (M1 or newer)."
  exit 1
fi

mkdir -p "$runtime_root/bin" "$runtime_root/huggingface"

if [[ -e "$model_root" && ! -d "$model_root/.git" ]]; then
  echo "Refusing to replace the existing non-Git folder: $model_root"
  exit 1
fi

if [[ ! -d "$model_root/.git" ]]; then
  git clone --depth 1 https://github.com/ACE-Step/ACE-Step-1.5.git "$model_root"
else
  echo "ACE-Step source already exists; preserving it without updating."
fi

if [[ ! -x "$uv_bin" ]]; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="$runtime_root/bin" UV_NO_MODIFY_PATH=1 sh
fi

"$uv_bin" --version
echo "Setup complete. Start Sonora with: npm start"
echo "The first start installs the Python runtime and downloads ACE-Step weights (about 10 GB)."
