import { network } from "hardhat";
import { loadZKProofData, loadCoveredTreeData } from "./zkProofLoader.js";
import { TEST_AMOUNTS, TEST_DURATIONS, bigIntToBytes32 } from "./constants.js";

/**
 * 基础部署 fixture：仅部署 Verifier 和 ZKMedicalInsurance
 */
export async function deployZKInsuranceFixture() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const testClient = await viem.getTestClient();
  const [deployer, insurer, hospital, user1, user2] = await viem.getWalletClients();

  // 部署 Groth16Verifier
  const verifier = await viem.deployContract("Groth16Verifier");

  // 部署 ZKMedicalInsurance
  const insurance = await viem.deployContract("ZKMedicalInsurance", [verifier.address]);

  return {
    viem,
    publicClient,
    testClient,
    deployer,
    insurer,
    hospital,
    user1,
    user2,
    verifier,
    insurance,
  };
}

/**
 * 部署 fixture + MockERC20 代币
 */
export async function deployWithMockTokenFixture() {
  const base = await deployZKInsuranceFixture();
  const { viem } = base;

  // 部署 MockERC20
  const token = await viem.deployContract("MockERC20", [
    "Test Token",
    "TEST",
    18,
  ]);

  // 给测试账户铸造代币
  await token.write.mint([base.deployer.account.address, TEST_AMOUNTS.POOL_FUNDING * 10n]);
  await token.write.mint([base.insurer.account.address, TEST_AMOUNTS.POOL_FUNDING * 10n]);
  await token.write.mint([base.user1.account.address, TEST_AMOUNTS.POOL_FUNDING]);
  await token.write.mint([base.user2.account.address, TEST_AMOUNTS.POOL_FUNDING]);

  return {
    ...base,
    token,
  };
}

/**
 * 部署 fixture + 配置角色
 */
export async function deployWithRolesFixture() {
  const base = await deployWithMockTokenFixture();
  const { insurance, insurer, hospital, deployer } = base;

  // 授予 INSURER_ROLE
  const INSURER_ROLE = await insurance.read.INSURER_ROLE();
  await insurance.write.grantRole([INSURER_ROLE, insurer.account.address], {
    account: deployer.account,
  });

  // 授予 HOSPITAL_ROLE
  const HOSPITAL_ROLE = await insurance.read.HOSPITAL_ROLE();
  await insurance.write.grantRole([HOSPITAL_ROLE, hospital.account.address], {
    account: deployer.account,
  });

  // 授予 PAUSER_ROLE (给 deployer，方便测试)
  const PAUSER_ROLE = await insurance.read.PAUSER_ROLE();
  await insurance.write.grantRole([PAUSER_ROLE, deployer.account.address], {
    account: deployer.account,
  });

  return base;
}

/**
 * 创建测试产品的 fixture
 */
export async function deployWithProductFixture() {
  const base = await deployWithRolesFixture();
  const { insurance, token, insurer } = base;

  // 加载 Merkle 树数据获取 coveredRoot
  const treeData = loadCoveredTreeData();
  const coveredRoot = bigIntToBytes32(BigInt(treeData.root));

  // 创建保险产品
  const tx = await insurance.write.createProduct(
    [
      token.address,
      TEST_AMOUNTS.PREMIUM,
      TEST_AMOUNTS.MAX_COVERAGE,
      TEST_DURATIONS.COVERAGE_PERIOD_DAYS,
      coveredRoot,
      "ipfs://QmTestProduct",
    ],
    { account: insurer.account }
  );

  // 等待交易确认
  await base.publicClient.waitForTransactionReceipt({ hash: tx });

  const productId = 1n; // 第一个产品 ID

  // 为产品池注资
  await token.write.approve([insurance.address, TEST_AMOUNTS.POOL_FUNDING], {
    account: insurer.account,
  });
  await insurance.write.fundPool([productId, TEST_AMOUNTS.POOL_FUNDING], {
    account: insurer.account,
  });

  return {
    ...base,
    productId,
    coveredRoot,
  };
}

/**
 * 创建测试保单的 fixture
 */
export async function deployWithPolicyFixture() {
  const base = await deployWithProductFixture();
  const { insurance, token, user1, productId } = base;

  // 用户购买保单
  await token.write.approve([insurance.address, TEST_AMOUNTS.PREMIUM], {
    account: user1.account,
  });
  const tx = await insurance.write.buyPolicy([productId], {
    account: user1.account,
  });

  await base.publicClient.waitForTransactionReceipt({ hash: tx });

  const policyId = 1n; // 第一个保单 ID

  return {
    ...base,
    policyId,
  };
}

/**
 * 获取 ZK 证明数据的辅助函数
 */
export function getZKProofData() {
  return loadZKProofData();
}

/**
 * 获取 Merkle 树数据的辅助函数
 */
export function getCoveredTreeData() {
  return loadCoveredTreeData();
}

/**
 * 类型定义
 */
export type DeployedContracts = Awaited<ReturnType<typeof deployZKInsuranceFixture>>;
export type DeployedWithToken = Awaited<ReturnType<typeof deployWithMockTokenFixture>>;
export type DeployedWithRoles = Awaited<ReturnType<typeof deployWithRolesFixture>>;
export type DeployedWithProduct = Awaited<ReturnType<typeof deployWithProductFixture>>;
export type DeployedWithPolicy = Awaited<ReturnType<typeof deployWithPolicyFixture>>;
