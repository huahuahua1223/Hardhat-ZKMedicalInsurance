// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGroth16Verifier
 * @notice Groth16 验证器接口，供业务合约提交证明时调用。
 * @dev 公开输入数组长度固定为 5，对应电路中声明的 5 个公开输入。
 */
interface IGroth16Verifier {
    /**
     * @notice 验证一份 Groth16 证明是否与公开输入匹配。
     * @param a 证明中的 G1 点 A。
     * @param b 证明中的 G2 点 B。
     * @param c 证明中的 G1 点 C。
     * @param input 电路公开输入，顺序必须与 verifier 导出时保持一致。
     * @return 若证明有效则返回 true，否则返回 false。
     */
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[5] calldata input
    ) external view returns (bool);
}
