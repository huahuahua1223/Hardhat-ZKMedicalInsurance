// 生成 coveredRoot + Merkle path：scripts/zk/build-covered-tree.ts

// 输入：疾病 id 列表（整数）
// 输出：coveredTree.json（root、leaves、zeros、layers）
import fs from "fs";
import path from "path";
import { buildPoseidon } from "circomlibjs";

type TreeDump = {
  depth: number;
  root: string;
  leaves: string[];
  zeros: string[];
  layers: string[][]; // layers[0]=leaves, layers[depth]=root layer (len 1)
};

function toDec(x: bigint) { return x.toString(10); }

async function main() {
  const depth = Number(process.env.DEPTH ?? "16");
  const inFile = process.env.DISEASES ?? "diseases.json"; // e.g. [101,102,103]
  const outFile = process.env.OUT ?? "coveredTree.json";

  const diseases: (number | string)[] = JSON.parse(fs.readFileSync(inFile, "utf8"));

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const H1 = (a: bigint) => F.toObject(poseidon([a])) as bigint;
  const H2 = (l: bigint, r: bigint) => F.toObject(poseidon([l, r])) as bigint;

  // zeros
  const zeros: bigint[] = [];
  zeros[0] = 0n;
  for (let i = 1; i <= depth; i++) zeros[i] = H2(zeros[i - 1], zeros[i - 1]);

  // leaves: leaf = Poseidon(diseaseId)
  const rawLeaves = diseases.map((d) => BigInt(d));
  const leavesHashed = rawLeaves.map(H1);

  const maxLeaves = 1 << depth;
  if (leavesHashed.length > maxLeaves) throw new Error(`Too many leaves for depth=${depth}`);

  // pad leaves with 0
  const leaves: bigint[] = leavesHashed.concat(Array(maxLeaves - leavesHashed.length).fill(zeros[0]));

  const layers: bigint[][] = [];
  layers[0] = leaves;

  for (let lvl = 1; lvl <= depth; lvl++) {
    const prev = layers[lvl - 1];
    const cur: bigint[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      cur.push(H2(prev[i], prev[i + 1]));
    }
    layers[lvl] = cur;
  }

  const dump: TreeDump = {
    depth,
    root: toDec(layers[depth][0]),
    leaves: leavesHashed.map(toDec),
    zeros: zeros.map(toDec),
    layers: layers.map((layer) => layer.map(toDec)),
  };

  fs.writeFileSync(outFile, JSON.stringify(dump, null, 2));
  console.log(`✅ Wrote ${outFile}`);
  console.log(`root = ${dump.root}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});