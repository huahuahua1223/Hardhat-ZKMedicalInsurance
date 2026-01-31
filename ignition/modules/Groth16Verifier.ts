import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Groth16Verifier 部署模块
 * 单独部署验证器合约，便于升级和重用
 */
export default buildModule("Groth16VerifierModule", (m) => {
  // 部署 Groth16Verifier 合约
  const verifier = m.contract("Groth16Verifier");

  return { verifier };
});
