pragma circom 2.1.8;

include "circomlib/circuits/poseidon.circom";

// Poseidon-based Merkle inclusion proof
template MerkleInclusion(depth) {
    signal input leaf;
    signal input root;
    signal input pathElements[depth];
    signal input pathIndices[depth]; // 0 or 1

    // 声明所有 signals 和 components 在循环外（circom 2.x 要求）
    component h[depth];
    signal left[depth];
    signal right[depth];
    signal hashes[depth + 1];
    
    // 中间信号用于彻底分解非二次约束
    signal oneMinusB[depth];
    signal leftTerm1[depth];   // hashes[i] * oneMinusB[i]
    signal leftTerm2[depth];   // pathElements[i] * pathIndices[i]
    signal rightTerm1[depth];  // pathElements[i] * oneMinusB[i]
    signal rightTerm2[depth];  // hashes[i] * pathIndices[i]

    hashes[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        h[i] = Poseidon(2);

        // If pathIndices[i] == 0: hashes[i] is left, sibling is right
        // If pathIndices[i] == 1: sibling is left, hashes[i] is right
        // 
        // 彻底分解非二次约束，每一步都独立计算：
        oneMinusB[i] <== 1 - pathIndices[i];
        
        // 计算 left = hashes[i] * oneMinusB[i] + pathElements[i] * pathIndices[i]
        leftTerm1[i] <== hashes[i] * oneMinusB[i];
        leftTerm2[i] <== pathElements[i] * pathIndices[i];
        left[i] <== leftTerm1[i] + leftTerm2[i];
        
        // 计算 right = pathElements[i] * oneMinusB[i] + hashes[i] * pathIndices[i]
        rightTerm1[i] <== pathElements[i] * oneMinusB[i];
        rightTerm2[i] <== hashes[i] * pathIndices[i];
        right[i] <== rightTerm1[i] + rightTerm2[i];

        h[i].inputs[0] <== left[i];
        h[i].inputs[1] <== right[i];

        hashes[i+1] <== h[i].out;
    }

    // enforce
    hashes[depth] === root;
}

template MedicalClaim(depth) {
    // -------- public inputs (5) --------
    signal input policyId;
    signal input amount;
    signal input dataHashField;
    signal input coveredRoot;
    signal input nullifier;

    // -------- private inputs --------
    signal input diseaseId;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal input secret;

    // leaf = Poseidon(diseaseId)
    component leafH = Poseidon(1);
    leafH.inputs[0] <== diseaseId;

    // Merkle inclusion
    component inc = MerkleInclusion(depth);
    inc.leaf <== leafH.out;
    inc.root <== coveredRoot;

    for (var i = 0; i < depth; i++) {
        inc.pathElements[i] <== pathElements[i];
        inc.pathIndices[i] <== pathIndices[i];
    }

    // nullifier == Poseidon(secret, policyId, amount, dataHashField)
    component n = Poseidon(4);
    n.inputs[0] <== secret;
    n.inputs[1] <== policyId;
    n.inputs[2] <== amount;
    n.inputs[3] <== dataHashField;

    n.out === nullifier;
}

component main {public [policyId, amount, dataHashField, coveredRoot, nullifier]} = MedicalClaim(16);