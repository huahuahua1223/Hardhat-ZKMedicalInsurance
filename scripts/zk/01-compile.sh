#!/usr/bin/env bash
set -euo pipefail

CIRCUIT=circuits/medical_claim.circom
OUTDIR=zkbuild
mkdir -p "$OUTDIR"

# compile -> r1cs + wasm + sym
# -l 指定 circomlib 路径（pnpm 结构）
circom "$CIRCUIT" --r1cs --wasm --sym -o "$OUTDIR" -l node_modules/.pnpm/circomlib@2.0.5/node_modules

echo "✅ compiled:"
ls -lah "$OUTDIR"