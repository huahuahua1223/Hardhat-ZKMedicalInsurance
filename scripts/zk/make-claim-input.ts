// 生成电路输入（witness input）：scripts/zk/make-claim-input.ts

// 输出：claimInput.json，可直接喂给 snarkjs groth16 fullprove
import fs from "fs";
import { buildPoseidon } from "circomlibjs";
import dotenv from "dotenv";

// 加载 .env 文件
dotenv.config();

const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

type TreeDump = {
  depth: number;
  root: string;
  leaves: string[];  // hashed leaves (only real ones)
  layers: string[][];
};

function hexToBigInt(hex: string) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return BigInt("0x" + h);
}

function toDec(x: bigint) { return x.toString(10); }

function buildProof(tree: TreeDump, leafIndex: number) {
  const depth = tree.depth;
  const layers = tree.layers.map((layer) => layer.map(BigInt));

  let idx = leafIndex;
  const pathElements: bigint[] = [];
  const pathIndices: bigint[] = [];

  for (let lvl = 0; lvl < depth; lvl++) {
    const isRight = (idx & 1) === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;

    pathElements.push(layers[lvl][siblingIdx]);
    pathIndices.push(isRight ? 1n : 0n);

    idx = Math.floor(idx / 2);
  }

  return { pathElements, pathIndices };
}

async function main() {
  const treeFile = process.env.TREE ?? "coveredTree.json";
  const outFile = process.env.OUT ?? "claimInput.json";

  const policyId = BigInt(process.env.POLICY_ID ?? "1");
  const amount = BigInt(process.env.AMOUNT ?? "1000000"); // token smallest unit
  const dataHashHex = process.env.DATA_HASH ?? "0x" + "11".repeat(32); // bytes32
  const leafIndex = Number(process.env.LEAF_INDEX ?? "0"); // which disease leaf
  const diseaseId = BigInt(process.env.DISEASE_ID ?? "101");
  const secret = BigInt(process.env.SECRET ?? "123456789"); // private

  const tree: TreeDump = JSON.parse(fs.readFileSync(treeFile, "utf8"));
  const coveredRoot = BigInt(tree.root);

  const { pathElements, pathIndices } = buildProof(tree, leafIndex);

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const dataHashField = hexToBigInt(dataHashHex) % SNARK_FIELD;

  // nullifier = Poseidon(secret, policyId, amount, dataHashField)
  const nullifier = F.toObject(poseidon([secret, policyId, amount, dataHashField])) as bigint;

  const input = {
    policyId: toDec(policyId),
    amount: toDec(amount),
    dataHashField: toDec(dataHashField),
    coveredRoot: toDec(coveredRoot),
    nullifier: toDec(nullifier),

    diseaseId: toDec(diseaseId),
    pathElements: pathElements.map(toDec),
    pathIndices: pathIndices.map(toDec),
    secret: toDec(secret),
  };

  fs.writeFileSync(outFile, JSON.stringify(input, null, 2));
  console.log(`✅ Wrote ${outFile}`);
  console.log(`dataHashField = ${input.dataHashField}`);
  console.log(`nullifier     = ${input.nullifier}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});