#!/usr/bin/env bash
set -euo pipefail

OUTDIR=zkbuild
WASM="$OUTDIR/medical_claim_js/medical_claim.wasm"
ZKEY="$OUTDIR/medical_claim_final.zkey"

INPUT="claimInput.json"
PROOF="$OUTDIR/proof.json"
PUBLIC="$OUTDIR/public.json"

snarkjs groth16 fullprove "$INPUT" "$WASM" "$ZKEY" "$PROOF" "$PUBLIC"

echo "✅ proof generated:"
ls -lah "$PROOF" "$PUBLIC"

echo "---- raw call data (string) ----"
snarkjs groth16 exportSolidityCallData "$PROOF" "$PUBLIC"