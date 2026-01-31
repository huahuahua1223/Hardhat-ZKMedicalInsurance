// 生成零知识证明：scripts/zk/03-prove.ts

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const OUTDIR = "zkbuild";
const WASM = path.join(OUTDIR, "medical_claim_js", "medical_claim.wasm");
const ZKEY = path.join(OUTDIR, "medical_claim_final.zkey");
const INPUT = process.env.INPUT || "claimInput.json";
const PROOF = path.join(OUTDIR, "proof.json");
const PUBLIC = path.join(OUTDIR, "public.json");

async function main() {
  // 检查必需文件
  const required = [WASM, ZKEY, INPUT];
  for (const file of required) {
    if (!fs.existsSync(file)) {
      console.error(`❌ 找不到文件: ${file}`);
      if (file === WASM) console.error("   请先运行 01-compile.ts");
      if (file === ZKEY) console.error("   请先运行 02-setup-groth16.ts");
      if (file === INPUT) console.error("   请先创建输入文件，可以运行 make-claim-input.ts");
      process.exit(1);
    }
  }

  console.log(`🔐 使用输入文件生成证明: ${INPUT}`);
  console.log("⏳ 正在生成证明（这可能需要几秒到几分钟）...");

  try {
    // 生成证明
    const cmd = `snarkjs groth16 fullprove "${INPUT}" "${WASM}" "${ZKEY}" "${PROOF}" "${PUBLIC}"`;
    console.log(`执行: ${cmd}`);
    
    execSync(cmd, { encoding: "utf8", stdio: "inherit" });

    console.log("\n✅ 证明生成成功！");
    console.log(`  - 证明文件: ${PROOF}`);
    console.log(`  - 公开输入: ${PUBLIC}`);

    // 显示文件大小
    const proofStats = fs.statSync(PROOF);
    const publicStats = fs.statSync(PUBLIC);
    console.log(`  - 证明大小: ${(proofStats.size / 1024).toFixed(2)} KB`);
    console.log(`  - 公开输入大小: ${(publicStats.size / 1024).toFixed(2)} KB`);

    // 尝试导出 Solidity calldata（可选）
    console.log("\n📤 尝试导出 Solidity 调用数据...");
    try {
      const calldataCmd = `snarkjs groth16 exportSolidityCallData "${PROOF}" "${PUBLIC}"`;
      const calldata = execSync(calldataCmd, { encoding: "utf8" });
      console.log("---- 原始 calldata ----");
      console.log(calldata);
    } catch (calldataError) {
      console.log("⚠️  快速导出失败（这是正常的）");
    }

    console.log("\n💡 下一步: 运行 'pnpm tsx scripts/zk/export-calldata.ts' 获取格式化的合约调用参数");
  } catch (error: any) {
    console.error("❌ 生成证明失败:", error.message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
