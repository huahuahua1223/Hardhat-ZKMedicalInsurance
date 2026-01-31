import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import Groth16VerifierModule from "./Groth16Verifier.js";

/**
 * ZKMedicalInsurance 主合约部署模块
 * 只负责部署合约，不进行角色配置
 */
export default buildModule("ZKMedicalInsuranceModule", (m) => {
  // 1. 部署或引用 Groth16Verifier
  const { verifier } = m.useModule(Groth16VerifierModule);

  // 2. 部署 ZKMedicalInsurance 主合约
  const insurance = m.contract("ZKMedicalInsurance", [verifier]);

  return { verifier, insurance };
});
