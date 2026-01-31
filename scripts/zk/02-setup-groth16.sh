#!/usr/bin/env bash
set -euo pipefail

OUTDIR=zkbuild
R1CS="$OUTDIR/medical_claim.r1cs"
PTAU_POWER=15  # 2^15 = 32768，足够支持约 16384 个约束
PTAU="$OUTDIR/pot${PTAU_POWER}_final.ptau"
ZKEY0="$OUTDIR/medical_claim_0000.zkey"
ZKEY="$OUTDIR/medical_claim_final.zkey"
VKEY="$OUTDIR/verification_key.json"

# 1) powers of tau (使用 15 以支持大电路；约束数 ~9535)
snarkjs powersoftau new bn128 $PTAU_POWER "$OUTDIR/pot${PTAU_POWER}_0000.ptau" -v
snarkjs powersoftau contribute "$OUTDIR/pot${PTAU_POWER}_0000.ptau" "$OUTDIR/pot${PTAU_POWER}_0001.ptau" --name="first" -v -e="random entropy"
snarkjs powersoftau prepare phase2 "$OUTDIR/pot${PTAU_POWER}_0001.ptau" "$PTAU" -v

# 2) groth16 setup
snarkjs groth16 setup "$R1CS" "$PTAU" "$ZKEY0"
snarkjs zkey contribute "$ZKEY0" "$ZKEY" --name="1st" -v -e="more entropy"

# 3) export verifier + vkey
snarkjs zkey export verificationkey "$ZKEY" "$VKEY"
snarkjs zkey export solidityverifier "$ZKEY" "contracts/Groth16Verifier.sol"

echo "✅ zkey + verifier exported:"
ls -lah "$OUTDIR"
echo "✅ Solidity verifier at contracts/Groth16Verifier.sol"