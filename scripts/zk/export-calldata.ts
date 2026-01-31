// 导出合约调用参数（a,b,c,input）：scripts/zk/export-calldata.ts

// 这个脚本会把 proof.json/public.json 变成你调用合约需要的结构（并额外输出 input[0..4]）
import fs from "fs";
import path from "path";
import * as snarkjs from "snarkjs";

function unstringifyBigInts(o: any): any {
  if (typeof o === "string" && /^[0-9]+$/.test(o)) return BigInt(o);
  if (Array.isArray(o)) return o.map(unstringifyBigInts);
  if (typeof o === "object" && o !== null) {
    const res: any = {};
    for (const k of Object.keys(o)) res[k] = unstringifyBigInts(o[k]);
    return res;
  }
  return o;
}

async function main() {
  const proofPath = process.env.PROOF_FILE ?? path.join("zkbuild", "proof.json");
  const publicPath = process.env.PUBLIC_FILE ?? path.join("zkbuild", "public.json");

  // 检查文件是否存在
  if (!fs.existsSync(proofPath)) {
    console.error(`❌ 找不到证明文件: ${proofPath}`);
    console.error("   请先运行: pnpm tsx scripts/zk/03-prove.ts");
    process.exit(1);
  }
  if (!fs.existsSync(publicPath)) {
    console.error(`❌ 找不到公开输入文件: ${publicPath}`);
    console.error("   请先运行: pnpm tsx scripts/zk/03-prove.ts");
    process.exit(1);
  }

  const proof = unstringifyBigInts(JSON.parse(fs.readFileSync(proofPath, "utf8")));
  const pub = unstringifyBigInts(JSON.parse(fs.readFileSync(publicPath, "utf8")));

  // returns string like: ["a0","a1",[[...],[...]],["c0","c1"],["in0"...]]
  const calldata: string = await (snarkjs as any).groth16.exportSolidityCallData(proof, pub);
  const argv = JSON.parse("[" + calldata + "]");

  const a = argv[0].map((x: string) => BigInt(x));
  const b = argv[1].map((row: string[]) => row.map((x) => BigInt(x)));
  const c = argv[2].map((x: string) => BigInt(x));
  const input = argv[3].map((x: string) => BigInt(x));

  console.log("\n📦 合约调用参数：");
  console.log("==========================================");
  console.log("a =", a);
  console.log("b =", b);
  console.log("c =", c);
  console.log("\n公开输入 (input):");
  console.log("  [0] policyId       =", input[0]);
  console.log("  [1] amount         =", input[1]);
  console.log("  [2] dataHashField  =", input[2]);
  console.log("  [3] coveredRoot    =", input[3]);
  console.log("  [4] nullifier      =", input[4]);
  console.log("==========================================");
  console.log("\n✅ 使用这些参数调用合约：");
  console.log("   submitClaimWithProof(policyId, amount, dataHash, nullifier, a, b, c, input)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});