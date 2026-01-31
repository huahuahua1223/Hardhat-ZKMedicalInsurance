import fs from "fs";
import path from "path";

/**
 * ZK 证明数据结构
 */
export interface ZKProofData {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
  publicSignals: [bigint, bigint, bigint, bigint, bigint];
}

/**
 * 从 zkbuild/ 目录加载真实的 ZK 证明数据
 */
export function loadZKProofData(): ZKProofData {
  const proofPath = path.join(process.cwd(), "zkbuild", "proof.json");
  const publicPath = path.join(process.cwd(), "zkbuild", "public.json");

  if (!fs.existsSync(proofPath)) {
    throw new Error(
      `证明文件不存在: ${proofPath}\n请先运行: pnpm zk:full`
    );
  }

  if (!fs.existsSync(publicPath)) {
    throw new Error(
      `公开输入文件不存在: ${publicPath}\n请先运行: pnpm zk:full`
    );
  }

  const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  const publicSignals = JSON.parse(fs.readFileSync(publicPath, "utf8"));

  return formatProofForContract(proof, publicSignals);
}

/**
 * 格式化证明数据为合约调用格式
 */
function formatProofForContract(proof: any, publicSignals: string[]): ZKProofData {
  return {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])], // 注意：snarkjs 的 b 需要交换顺序
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    publicSignals: [
      BigInt(publicSignals[0]), // policyId
      BigInt(publicSignals[1]), // amount
      BigInt(publicSignals[2]), // dataHashField
      BigInt(publicSignals[3]), // coveredRoot
      BigInt(publicSignals[4]), // nullifier
    ],
  };
}

/**
 * 加载理赔输入数据
 */
export function loadClaimInputData() {
  const inputPath = path.join(process.cwd(), "claimInput.json");
  
  if (!fs.existsSync(inputPath)) {
    throw new Error(
      `理赔输入文件不存在: ${inputPath}\n请先运行: pnpm zk:input`
    );
  }

  return JSON.parse(fs.readFileSync(inputPath, "utf8"));
}

/**
 * 加载 Merkle 树数据
 */
export function loadCoveredTreeData() {
  const treePath = path.join(process.cwd(), "coveredTree.json");
  
  if (!fs.existsSync(treePath)) {
    throw new Error(
      `Merkle 树文件不存在: ${treePath}\n请先运行: pnpm zk:tree`
    );
  }

  return JSON.parse(fs.readFileSync(treePath, "utf8"));
}

/**
 * 加载疾病列表
 */
export function loadDiseasesData() {
  const diseasesPath = path.join(process.cwd(), "diseases.json");
  
  if (!fs.existsSync(diseasesPath)) {
    throw new Error(`疾病列表文件不存在: ${diseasesPath}`);
  }

  return JSON.parse(fs.readFileSync(diseasesPath, "utf8"));
}
