// 生成 Groth16 证明密钥和验证器：scripts/zk/02-setup-groth16.ts

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const OUTDIR = "zkbuild";
const R1CS = path.join(OUTDIR, "medical_claim.r1cs");
const PTAU_POWER = 15;  // 2^15 = 32768，足够支持约 16384 个约束
const PTAU = path.join(OUTDIR, `pot${PTAU_POWER}_final.ptau`);
const ZKEY0 = path.join(OUTDIR, "medical_claim_0000.zkey");
const ZKEY = path.join(OUTDIR, "medical_claim_final.zkey");
const VKEY = path.join(OUTDIR, "verification_key.json");
const VERIFIER_CONTRACT = "contracts/Groth16Verifier.sol";

function runCmd(cmd: string, desc: string) {
  console.log(`\n🔧 ${desc}...`);
  console.log(`执行: ${cmd}`);
  try {
    execSync(cmd, { encoding: "utf8", stdio: "inherit" });
  } catch (error: any) {
    console.error(`❌ ${desc} 失败:`, error.message);
    process.exit(1);
  }
}

async function main() {
  // 检查 r1cs 文件是否存在
  if (!fs.existsSync(R1CS)) {
    console.error(`❌ 找不到 ${R1CS}，请先运行 01-compile.ts`);
    process.exit(1);
  }

  console.log("🚀 开始 Groth16 可信设置...");
  console.log(`⚠️  使用 Powers of Tau 参数: ${PTAU_POWER} (2^${PTAU_POWER} = ${2**PTAU_POWER} 约束)`);
  console.log("⚠️  这个过程可能需要几分钟，请耐心等待");

  // 1) Powers of Tau 仪式（使用 15 以支持约 16384 个约束）
  runCmd(
    `snarkjs powersoftau new bn128 ${PTAU_POWER} "${OUTDIR}/pot${PTAU_POWER}_0000.ptau" -v`,
    "Step 1/7: 初始化 Powers of Tau"
  );

  runCmd(
    `snarkjs powersoftau contribute "${OUTDIR}/pot${PTAU_POWER}_0000.ptau" "${OUTDIR}/pot${PTAU_POWER}_0001.ptau" --name="first" -v -e="random entropy"`,
    "Step 2/7: Powers of Tau 贡献"
  );

  runCmd(
    `snarkjs powersoftau prepare phase2 "${OUTDIR}/pot${PTAU_POWER}_0001.ptau" "${PTAU}" -v`,
    "Step 3/7: 准备 Phase 2"
  );

  // 2) Groth16 Setup
  runCmd(
    `snarkjs groth16 setup "${R1CS}" "${PTAU}" "${ZKEY0}"`,
    "Step 4/7: Groth16 Setup"
  );

  runCmd(
    `snarkjs zkey contribute "${ZKEY0}" "${ZKEY}" --name="1st" -v -e="more entropy"`,
    "Step 5/7: ZKey 贡献"
  );

  // 3) 导出验证密钥 + Solidity 验证器
  runCmd(
    `snarkjs zkey export verificationkey "${ZKEY}" "${VKEY}"`,
    "Step 6/7: 导出验证密钥"
  );

  runCmd(
    `snarkjs zkey export solidityverifier "${ZKEY}" "${VERIFIER_CONTRACT}"`,
    "Step 7/7: 导出 Solidity 验证器"
  );

  console.log("\n✅ Groth16 Setup 完成！");
  console.log("\n生成的文件:");
  
  const files = [PTAU, ZKEY, VKEY];
  files.forEach(file => {
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      console.log(`  - ${path.basename(file)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    }
  });
  
  console.log(`  - ${VERIFIER_CONTRACT} (Solidity 验证器合约)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
