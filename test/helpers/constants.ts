/**
 * 测试常量定义
 */

// BN254 scalar field (snarkjs / groth16 public inputs must be < this)
export const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// 测试用金额
export const TEST_AMOUNTS = {
  PREMIUM: 1000000n,           // 100 万 wei (保费)
  MAX_COVERAGE: 10000000n,     // 1000 万 wei (最大赔付)
  CLAIM_AMOUNT: 1000000n,      // 100 万 wei (理赔金额)
  POOL_FUNDING: 100000000n,    // 1 亿 wei (资金池注资)
} as const;

// 测试用时间（秒）
export const TEST_DURATIONS = {
  ONE_DAY: 86400,
  ONE_WEEK: 604800,
  ONE_MONTH: 2592000,
  ONE_YEAR: 31536000,
  COVERAGE_PERIOD_DAYS: 365,   // 保险期限（天）
} as const;

// 测试用数据哈希
export const TEST_DATA_HASH = "0x1111111111111111111111111111111111111111111111111111111111111111";

// 测试用疾病 ID
export const TEST_DISEASE_IDS = {
  COVERED: 101,      // 承保的疾病
  NOT_COVERED: 999,  // 未承保的疾病
} as const;

// 测试用 URI
export const TEST_PRODUCT_URI = "ipfs://QmTest123456789";

// 零地址
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// 角色哈希（从合约中读取）
export const ROLES = {
  DEFAULT_ADMIN: "0x0000000000000000000000000000000000000000000000000000000000000000",
  INSURER: "0x" + "49f4fd5593b5a8b1ae5e8cc5f56283816c3d36e3c50bfe1f8d7d6e6e52f4b1a2", // keccak256("INSURER_ROLE")
  HOSPITAL: "0x" + "4e7b7f5c9e5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e", // keccak256("HOSPITAL_ROLE")
  PAUSER: "0x" + "65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a", // keccak256("PAUSER_ROLE")
} as const;

// 枚举类型映射（与合约保持一致）
export enum PolicyStatus {
  Active = 0,
  Cancelled = 1,
  Expired = 2,
}

export enum ClaimStatus {
  Submitted = 0,
  Verified = 1,
  Approved = 2,
  Rejected = 3,
  Paid = 4,
}

/**
 * 辅助函数：将 bytes32 转换为 bigint（用于 coveredRoot 等）
 */
export function bytes32ToBigInt(bytes32: string): bigint {
  if (!bytes32.startsWith("0x")) {
    bytes32 = "0x" + bytes32;
  }
  return BigInt(bytes32);
}

/**
 * 辅助函数：将 bigint 转换为 bytes32
 */
export function bigIntToBytes32(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}` as `0x${string}`;
}

/**
 * 辅助函数：生成随机 nullifier
 */
export function randomNullifier(): `0x${string}` {
  const randomBigInt = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
  return bigIntToBytes32(randomBigInt);
}

/**
 * 辅助函数：时间戳转换
 */
export function toTimestamp(date: Date): bigint {
  return BigInt(Math.floor(date.getTime() / 1000));
}

/**
 * 辅助函数：从当前时间增加指定秒数
 */
export function addSeconds(seconds: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + seconds);
}
