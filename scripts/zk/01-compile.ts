// 编译 circom 电路：scripts/zk/01-compile.ts
// 注意：这需要安装 circom 编译器
// Windows: 从 https://github.com/iden3/circom/releases 下载 circom-windows-amd64.exe
// WSL/Linux: curl -L https://github.com/iden3/circom/releases/download/v2.2.1/circom-linux-amd64 -o /usr/local/bin/circom

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const CIRCUIT = "circuits/medical_claim.circom";
const OUTDIR = "zkbuild";

async function main() {
  // 创建输出目录
  if (!fs.existsSync(OUTDIR)) {
    fs.mkdirSync(OUTDIR, { recursive: true });
  }

  console.log(`🔨 编译电路: ${CIRCUIT}...`);
  
  try {
    // 编译电路 -> r1cs + wasm + sym
    // -l 指定库路径：pnpm 的 node_modules 结构需要指定到具体路径
    const circomlibPath = "node_modules/.pnpm/circomlib@2.0.5/node_modules";
    const cmd = `circom "${CIRCUIT}" --r1cs --wasm --sym -o "${OUTDIR}" -l "${circomlibPath}"`;
    console.log(`执行: ${cmd}`);
    
    const output = execSync(cmd, { 
      encoding: "utf8",
      stdio: "inherit" // 实时显示输出
    });

    console.log("\n✅ 编译完成！输出文件:");
    
    // 列出生成的文件
    const files = fs.readdirSync(OUTDIR);
    files.forEach(file => {
      const fullPath = path.join(OUTDIR, file);
      const stats = fs.statSync(fullPath);
      if (stats.isFile()) {
        console.log(`  - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
      } else if (stats.isDirectory()) {
        console.log(`  - ${file}/ (目录)`);
      }
    });
  } catch (error: any) {
    console.error("❌ 编译失败:", error.message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
