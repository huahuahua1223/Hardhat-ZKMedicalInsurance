import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * MockERC20 代币部署模块
 */
export default buildModule("MockERC20Module", (m) => {
  // 参数：代币名称、符号、精度
  const name = m.getParameter("name", "Test Token");
  const symbol = m.getParameter("symbol", "TEST");
  const decimals = m.getParameter("decimals", 18);

  // 部署 MockERC20 合约
  const token = m.contract("MockERC20", [name, symbol, decimals]);

  return { token };
});
