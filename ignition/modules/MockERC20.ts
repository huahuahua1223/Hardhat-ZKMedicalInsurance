import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * MockERC20 deployment module.
 */
export default buildModule("MockERC20Module", (m) => {
  // Default token parameters for local and Sepolia demo deployments.
  const name = m.getParameter("name", "Insurance Token");
  const symbol = m.getParameter("symbol", "INS");
  const decimals = m.getParameter("decimals", 6);

  // Deploy the mock ERC20 token contract.
  const token = m.contract("MockERC20", [name, symbol, decimals]);

  return { token };
});
