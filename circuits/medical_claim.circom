pragma circom 2.1.8;

include "circomlib/circuits/poseidon.circom";

// 辅助电路：
// 根据隐藏叶子节点和 Merkle 路径重新计算 Poseidon Merkle 根，
// 再约束它必须等于公开输入里的 root。

// 基于 Poseidon 哈希的 Merkle 包含证明模板。
// 输入叶子节点、Merkle 根、路径兄弟节点和路径方向，
// 输出通过约束保证 leaf 沿路径逐层哈希后等于 root。
template MerkleInclusion(depth) {
    signal input leaf;
    signal input root;
    signal input pathElements[depth];
    signal input pathIndices[depth]; // 0 表示当前哈希在左侧，1 表示当前哈希在右侧

    // Circom 2.x 要求循环中使用的信号和组件先在循环外声明。
    component h[depth];
    signal left[depth];
    signal right[depth];
    signal hashes[depth + 1];
    
    // 这些中间信号用于将左右子节点选择过程拆成二次约束。
    signal oneMinusB[depth];
    signal leftTerm1[depth];
    signal leftTerm2[depth];
    signal rightTerm1[depth];
    signal rightTerm2[depth];

    hashes[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        h[i] = Poseidon(2);

        // 当 pathIndices[i] == 0 时，hashes[i] 在左侧、兄弟节点在右侧。
        // 当 pathIndices[i] == 1 时，兄弟节点在左侧、hashes[i] 在右侧。
        oneMinusB[i] <== 1 - pathIndices[i];
        
        // 计算 left = hashes[i] * (1 - b) + pathElements[i] * b。
        leftTerm1[i] <== hashes[i] * oneMinusB[i];
        leftTerm2[i] <== pathElements[i] * pathIndices[i];
        left[i] <== leftTerm1[i] + leftTerm2[i];
        
        // 计算 right = pathElements[i] * (1 - b) + hashes[i] * b。
        rightTerm1[i] <== pathElements[i] * oneMinusB[i];
        rightTerm2[i] <== hashes[i] * pathIndices[i];
        right[i] <== rightTerm1[i] + rightTerm2[i];

        h[i].inputs[0] <== left[i];
        h[i].inputs[1] <== right[i];

        hashes[i + 1] <== h[i].out;
    }

    // 最终约束要求计算出的根与输入 root 完全一致。
    hashes[depth] === root;
}

// 医疗理赔证明电路。
// 公开输入用于链上校验保单、金额、材料哈希、保障范围根和 nullifier；
// 私有输入用于证明某个疾病编号确实包含在保障疾病集合中，
// 且 nullifier 由 secret 与本次理赔关键信息共同计算得到。
template MedicalClaim(depth) {
    // -------- 公开输入（5 个）--------
    // 业务电路：
    // 在不暴露具体疾病和用户 secret 的前提下，同时证明两件事：
    // 1）该疾病属于承保疾病集合；
    // 2）nullifier 确实由这次理赔上下文推导得到。
    signal input policyId;
    signal input amount;
    signal input dataHashField;
    signal input coveredRoot;
    signal input nullifier;

    // -------- 私有输入 --------
    signal input diseaseId;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal input secret;

    // 叶子节点为 Poseidon(diseaseId)。
    component leafH = Poseidon(1);
    leafH.inputs[0] <== diseaseId;

    // 约束 diseaseId 对应的叶子节点必须属于 coveredRoot 这棵树。
    component inc = MerkleInclusion(depth);
    // 约束组 1：
    // 隐藏的 diseaseId 必须能够通过 Merkle 路径还原出公开的 coveredRoot。
    inc.leaf <== leafH.out;
    inc.root <== coveredRoot;

    for (var i = 0; i < depth; i++) {
        inc.pathElements[i] <== pathElements[i];
        inc.pathIndices[i] <== pathIndices[i];
    }

    // nullifier 必须等于 Poseidon(secret, policyId, amount, dataHashField)。
    component n = Poseidon(4);
    // 约束组 2：
    // 公开的 nullifier 必须由用户 secret 和本次理赔公开字段共同计算得到，
    // 这样相同理赔上下文就不能被重复提交。
    n.inputs[0] <== secret;
    n.inputs[1] <== policyId;
    n.inputs[2] <== amount;
    n.inputs[3] <== dataHashField;

    n.out === nullifier;
}

component main {public [policyId, amount, dataHashField, coveredRoot, nullifier]} = MedicalClaim(16);
