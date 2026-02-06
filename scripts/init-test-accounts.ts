/**
 * Initialize Test Accounts Script
 * Mint USDT tokens to Hardhat local node test accounts
 *
 * Assumption:
 * - You are running `npx hardhat node` (or `hardhat node`) with the DEFAULT mnemonic
 *   "test test test test test test test test test test test junk".
 * - Then the following private keys (accounts #0-#3) are deterministic and valid.
 */

import hre from "hardhat";
import {
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  createPublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hardhat node default RPC
const RPC_URL = "http://127.0.0.1:8545";

// Hardhat default accounts private keys (#0 - #3)
// If you changed mnemonic/accounts in your hardhat config, replace these.
const PK0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const PK1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const PK2 = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const PK3 = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";

async function main() {
  console.log("\n========================================");
  console.log("Initializing Test Accounts");
  console.log("========================================\n");

  // Hardhat 3 connection (for reading artifacts / using hardhat-viem helpers)
  const connection = await hre.network.connect();
  const { viem } = connection;

  // Use hardhat's configured chain info if available; fallback is fine for localhost
  const hardhatPublicClient = await viem.getPublicClient();
  const chain = hardhatPublicClient.chain;

  // Create deterministic accounts from private keys
  const deployerAcc = privateKeyToAccount(PK0);
  const acc1 = privateKeyToAccount(PK1);
  const acc2 = privateKeyToAccount(PK2);
  const acc3 = privateKeyToAccount(PK3);

  // Create wallet clients (these always have `.account`)
  const deployer = createWalletClient({
    account: deployerAcc,
    chain,
    transport: http(RPC_URL),
  });

  const account1 = createWalletClient({
    account: acc1,
    chain,
    transport: http(RPC_URL),
  });

  const account2 = createWalletClient({
    account: acc2,
    chain,
    transport: http(RPC_URL),
  });

  const account3 = createWalletClient({
    account: acc3,
    chain,
    transport: http(RPC_URL),
  });

  // Public client for waiting receipts (you can use hardhatPublicClient too)
  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL),
  });

  console.log("📝 Test Account Addresses:");
  console.log(`  Deployer (Account #0): ${deployer.account.address}`);
  console.log(`  Account #1: ${account1.account.address}`);
  console.log(`  Account #2: ${account2.account.address}`);
  console.log(`  Account #3: ${account3.account.address}\n`);

  // Read contract addresses from deployment file
  const deploymentPath = path.join(
    __dirname,
    "..",
    "ignition",
    "deployments",
    "chain-31337",
    "deployed_addresses.json"
  );

  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ Deployment file not found:", deploymentPath);
    console.error("Please deploy contracts first: pnpm deploy:local");
    process.exitCode = 1;
    return;
  }

  const deployedAddresses = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const MOCK_USDT = deployedAddresses["MockERC20Module#MockERC20"];
  const INSURANCE_MANAGER = deployedAddresses["ZKMedicalInsuranceModule#ZKMedicalInsurance"];

  if (!MOCK_USDT || !INSURANCE_MANAGER) {
    console.error("❌ Contract addresses not found in deployment file");
    console.error("Available addresses:", Object.keys(deployedAddresses));
    process.exitCode = 1;
    return;
  }

  console.log("📋 Contract Addresses (from deployment file):");
  console.log(`  MockERC20 (USDT): ${MOCK_USDT}`);
  console.log(`  ZKMedicalInsurance: ${INSURANCE_MANAGER}\n`);

  // Get contract instance, bind wallet client (so write works)
  const mockUSDT = await viem.getContractAt("MockERC20", MOCK_USDT, {
    client: {
      public: publicClient,
      wallet: deployer, // mint typically requires minter/owner, use deployer to send tx
    },
  });

  // Use token decimals to avoid assuming 18
  const decimals = await mockUSDT.read.decimals();
  const mintAmount = parseUnits("10000", Number(decimals));

  console.log(
    `💰 Preparing to mint for each account: ${formatUnits(mintAmount, Number(decimals))} USDT\n`
  );

  console.log("🚀 Starting mint operations...\n");

  try {
    console.log("  [1/4] Minting to Deployer...");
    let hash = await mockUSDT.write.mint([deployer.account.address, mintAmount], {
      account: deployer.account,
    });
    console.log(`    ✅ Tx: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });

    console.log("  [2/4] Minting to Account #1...");
    hash = await mockUSDT.write.mint([account1.account.address, mintAmount], {
      account: deployer.account,
    });
    console.log(`    ✅ Tx: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });

    console.log("  [3/4] Minting to Account #2...");
    hash = await mockUSDT.write.mint([account2.account.address, mintAmount], {
      account: deployer.account,
    });
    console.log(`    ✅ Tx: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });

    console.log("  [4/4] Minting to Account #3...");
    hash = await mockUSDT.write.mint([account3.account.address, mintAmount], {
      account: deployer.account,
    });
    console.log(`    ✅ Tx: ${hash}\n`);
    await publicClient.waitForTransactionReceipt({ hash });
  } catch (error) {
    console.error("❌ Mint operation failed:", error);
    process.exitCode = 1;
    return;
  }

  console.log("📊 Verifying account balances:\n");

  try {
    const balance0 = await mockUSDT.read.balanceOf([deployer.account.address]);
    const balance1 = await mockUSDT.read.balanceOf([account1.account.address]);
    const balance2 = await mockUSDT.read.balanceOf([account2.account.address]);
    const balance3 = await mockUSDT.read.balanceOf([account3.account.address]);

    console.log(`  Deployer: ${formatUnits(balance0, Number(decimals))} USDT`);
    console.log(`  Account #1: ${formatUnits(balance1, Number(decimals))} USDT`);
    console.log(`  Account #2: ${formatUnits(balance2, Number(decimals))} USDT`);
    console.log(`  Account #3: ${formatUnits(balance3, Number(decimals))} USDT\n`);
  } catch (error) {
    console.error("❌ Failed to read balances:", error);
  }

  console.log("========================================");
  console.log("✅ Test accounts initialized successfully!");
  console.log("========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
