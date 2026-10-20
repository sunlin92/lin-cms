#!/usr/bin/env bash
# 交叉编译五平台单文件制品并生成 sha256（Go 一次构建全覆盖）
set -euo pipefail
cd "$(dirname "$0")"
VERSION="${LIN_CMS_CLI_VERSION:-$(git describe --tags 2>/dev/null || echo 0.1.0)}"
OUTDIR=dist
mkdir -p "$OUTDIR"
TARGETS=(
  "darwin arm64 lin-cms-${VERSION}-macos-arm64"
  "darwin amd64 lin-cms-${VERSION}-macos-x86_64"
  "linux amd64 lin-cms-${VERSION}-linux-x86_64"
  "linux arm64 lin-cms-${VERSION}-linux-arm64"
  "windows amd64 lin-cms-${VERSION}-windows-x86_64.exe"
)
for target in "${TARGETS[@]}"; do
  read -r os arch name <<<"$target"
  echo "building $name"
  CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o "$OUTDIR/$name" .
  shasum -a 256 "$OUTDIR/$name" > "$OUTDIR/$name.sha256"
done
echo "done: $OUTDIR"
