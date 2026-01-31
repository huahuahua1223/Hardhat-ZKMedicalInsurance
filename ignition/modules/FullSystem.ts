import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import ZKMedicalInsuranceModule from "./ZKMedicalInsurance.js";
import MockERC20Module from "./MockERC20.js";

/**
 * 完整系统部署模块（包含 MockERC20）
 * 用于测试环境的完整部署
 */
export default buildModule("FullSystemModule", (m) => {
  // 1. 部署主系统
  const { verifier, insurance } = m.useModule(ZKMedicalInsuranceModule);

  // 2. 部署 MockERC20
  const tokenModule = m.useModule(MockERC20Module);
  const token = tokenModule.token;

  return { verifier, insurance, token };
});
