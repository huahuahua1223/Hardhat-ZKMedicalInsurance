# ZK 医疗保险智能合约系统

基于零知识证明的去中心化医疗保险理赔系统，保护用户隐私的同时确保理赔透明性。

## 📋 项目简介

本项目是一个基于以太坊智能合约和 Groth16 零知识证明的医疗保险系统，主要特点：

- 🔒 **隐私保护**: 使用 ZK-SNARKs 技术，用户无需暴露敏感医疗数据即可证明理赔的合法性
- 🌳 **Merkle 树验证**: 通过 Poseidon 哈希构建的 Merkle 树管理保险覆盖范围
- 🛡️ **双重防护**: Nullifier 机制防止重复理赔，链上验证确保理赔真实性
- 🏥 **多角色管理**: 支持保险公司、医院、用户等多角色权限控制
- ⚡ **Gas 优化**: 使用高效的数据结构和批量查询接口

## 🏗️ 技术栈

### 智能合约
- **Solidity 0.8.28** - 智能合约开发语言
- **OpenZeppelin Contracts** - 标准化的安全合约库（AccessControl、Pausable、ReentrancyGuard）
- **Hardhat 3.x** - 以太坊开发环境
- **Viem** - 轻量级的以太坊交互库

### 零知识证明
- **Circom 2.1.8** - ZK 电路编写语言
- **SnarkJS** - 零知识证明生成和验证库
- **Groth16** - 高效的 ZK-SNARK 证明系统
- **Poseidon Hash** - ZK 友好的哈希函数

### 开发工具
- **TypeScript** - 类型安全的脚本开发
- **Node.js** - JavaScript 运行时
- **pnpm** - 快速、磁盘高效的包管理器
- **Hardhat Ignition** - 声明式合约部署工具

## 📦 项目结构

```
Hardhat-ZKMedicalInsurance/
├── contracts/                      # 智能合约源码
│   ├── ZKMedicalInsurance.sol     # 核心保险合约
│   ├── Groth16Verifier.sol        # ZK 证明验证器
│   ├── interfaces/                # 合约接口
│   │   └── IGroth16Verifier.sol
│   └── mocks/                     # 测试用 Mock 合约
│       └── MockERC20.sol
│
├── circuits/                       # Circom 电路
│   └── medical_claim.circom       # 医疗理赔电路
│
├── scripts/                        # 自动化脚本
│   ├── zk/                        # ZK 证明生成工具链
│   │   ├── build-covered-tree.ts  # 构建 Merkle 树
│   │   ├── 01-compile.ts          # 编译电路
│   │   ├── 02-setup-groth16.ts    # Groth16 设置
│   │   ├── make-claim-input.ts    # 生成证明输入
│   │   ├── 03-prove.ts            # 生成证明
│   │   ├── export-calldata.ts     # 导出调用数据
│   │   └── README.md              # ZK 工具链文档
│   └── send-op-tx.ts              # OP Stack 交易示例
│
├── test/                           # 测试套件
│   ├── ZKMedicalInsurance.test.ts # 核心功能测试
│   ├── AccessControl.test.ts      # 权限控制测试
│   ├── Groth16Verifier.test.ts    # 验证器测试
│   ├── EdgeCases.test.ts          # 边界情况测试
│   ├── Integration.test.ts        # 集成测试
│   └── helpers/                   # 测试辅助工具
│       ├── fixtures.ts            # 测试夹具
│       ├── constants.ts           # 测试常量
│       └── zkProofLoader.ts       # ZK 证明加载器
│
├── ignition/                       # Hardhat Ignition 部署模块
│   └── modules/
│       ├── FullSystem.ts          # 完整系统部署
│       ├── ZKMedicalInsurance.ts  # 保险合约部署
│       ├── Groth16Verifier.ts     # 验证器部署
│       └── MockERC20.ts           # Mock ERC20 部署
│
├── docs/                           # 文档
│   ├── 合约API速查表.md           # API 快速参考
│   ├── Lovable前端开发需求文档.md # 前端开发文档
│   ├── 前端交互流程设计.md        # 交互流程设计
│   └── 前端架构建议.md            # 架构建议
│
├── zkbuild/                        # ZK 构建输出（.gitignore）
│   ├── medical_claim.r1cs         # 电路约束系统
│   ├── medical_claim_js/          # WASM 执行文件
│   ├── medical_claim_final.zkey   # 最终 zkey
│   ├── verification_key.json      # 验证密钥
│   ├── proof.json                 # 零知识证明
│   └── public.json                # 公开输入
│
├── hardhat.config.ts               # Hardhat 配置
├── package.json                    # 项目依赖和脚本
├── tsconfig.json                   # TypeScript 配置
├── .env.example                    # 环境变量模板
└── README.md                       # 本文件
```

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0
- **Circom** >= 2.1.8（用于编译 ZK 电路）

### 安装依赖

```powershell
# 克隆仓库
git clone <repository-url>
cd Hardhat-ZKMedicalInsurance

# 安装依赖
pnpm install

# 复制环境变量模板
Copy-Item .env.example .env
```

### 安装 Circom（Windows）

1. 访问 [Circom Releases](https://github.com/iden3/circom/releases)
2. 下载 `circom-windows-amd64.exe`
3. 重命名为 `circom.exe` 并添加到系统 PATH

验证安装：
```powershell
circom --version  # 应显示 circom compiler 2.2.1 或更高版本
```

## 🔧 开发流程

### 1. 编译和测试合约

```powershell
# 编译合约
pnpm build:contracts

# 运行所有测试
pnpm test

# 运行测试覆盖率
pnpm test:coverage

# 运行 Gas 报告
pnpm test:gas

# 只运行单元测试
pnpm test:unit

# 只运行集成测试
pnpm test:integration
```

### 2. 生成零知识证明

完整的 ZK 证明生成流程（详见 `scripts/zk/README.md`）：

```powershell
# 一键执行完整流程（约 5-10 分钟）
pnpm zk:full

# 或分步执行：
pnpm zk:tree      # 1. 生成疾病覆盖范围 Merkle 树
pnpm zk:compile   # 2. 编译 circom 电路（~10秒）
pnpm zk:setup     # 3. Groth16 设置（~5-10分钟，仅需一次）
pnpm zk:input     # 4. 生成证明输入（需配置 .env）
pnpm zk:prove     # 5. 生成零知识证明（~10-30秒）
pnpm zk:export    # 6. 导出 Solidity 调用数据
```

⚠️ **注意**：`zk:setup` 步骤只需执行一次，生成的 `zkbuild/` 文件可以复用。

### 3. 本地部署

```powershell
# 启动本地节点（新终端）
npx hardhat node

# 部署完整系统（包括 MockERC20、Verifier、ZKMedicalInsurance）
pnpm deploy:local
```

### 4. 测试网部署

编辑 `.env` 文件：
```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
DEPLOYER_PRIVATE_KEY=0x...
```

部署到 Sepolia：
```powershell
npx hardhat ignition deploy --network sepolia ignition/modules/FullSystem.ts
```

## 📚 核心功能

### 保险产品管理（保险公司）

```javascript
// 创建保险产品
await contract.write.createProduct([
  tokenAddress,           // ERC20 代币地址
  premiumAmount,          // 保费金额
  maxCoverage,            // 最大赔付额
  coveragePeriodDays,     // 保险期限（天）
  coveredRoot,            // 疾病覆盖范围 Merkle 根
  "ipfs://..."            // 产品详情 URI
])

// 向资金池充值
await contract.write.fundPool([productId, amount])

// 更新疾病覆盖范围
await contract.write.updateCoveredRoot([productId, newRoot])
```

### 购买保单（用户）

```javascript
// 1. 授权 ERC20 代币
await token.write.approve([contractAddress, premiumAmount])

// 2. 购买保单
const policyId = await contract.write.buyPolicy([productId])
```

### 提交理赔（用户/医院）

```javascript
// 1. 在链下生成零知识证明（使用 pnpm zk:* 脚本）

// 2. 提交理赔并附带 ZK 证明
await contract.write.submitClaimWithProof([
  policyId,
  amount,
  dataHash,
  nullifier,
  [a[0], a[1]],                    // 证明参数 a
  [[b[0][0], b[0][1]], [b[1][0], b[1][1]]], // 证明参数 b
  [c[0], c[1]],                    // 证明参数 c
  [input[0], input[1], input[2], input[3], input[4]] // 公开输入
])
```

### 理赔审核（保险公司）

```javascript
// 批准理赔
await contract.write.approveClaim([claimId])

// 拒绝理赔
await contract.write.rejectClaim([claimId, decisionMemoHash])

// 支付理赔款
await contract.write.payoutClaim([claimId])
```

## 🔐 零知识证明原理

### 电路逻辑（`circuits/medical_claim.circom`）

证明以下声明而不泄露隐私数据：

1. **疾病在保险覆盖范围内**  
   通过 Poseidon Merkle 证明验证 `diseaseId` 在 `coveredRoot` 中

2. **Nullifier 正确性**  
   证明 `nullifier = Poseidon(secret, policyId, amount, dataHashField)`  
   防止同一理赔提交多次

3. **公开输入一致性**  
   验证 `policyId`、`amount`、`dataHashField`、`coveredRoot`、`nullifier` 与链上数据匹配

### 公开输入（5 个）

```javascript
input[0] = policyId          // 保单 ID
input[1] = amount            // 理赔金额
input[2] = dataHashField     // 数据哈希（模 SNARK_FIELD）
input[3] = coveredRoot       // 疾病覆盖范围 Merkle 根
input[4] = nullifier         // 防重放标识符
```

### 私有输入（不公开）

```javascript
diseaseId                    // 疾病 ID（敏感信息）
pathElements[depth]          // Merkle 证明路径（敏感信息）
pathIndices[depth]           // Merkle 证明索引（敏感信息）
secret                       // 用户密钥（敏感信息）
```

## 🧪 测试套件

项目包含全面的测试覆盖：

- **ZKMedicalInsurance.test.ts**: 核心功能测试（产品、保单、理赔）
- **AccessControl.test.ts**: 角色权限测试（INSURER、HOSPITAL、PAUSER）
- **Groth16Verifier.test.ts**: ZK 验证器测试
- **EdgeCases.test.ts**: 边界情况和异常处理测试
- **Integration.test.ts**: 端到端集成测试

运行特定测试：
```powershell
# 单个测试文件
npx hardhat test test/ZKMedicalInsurance.test.ts

# 查看详细输出
npx hardhat test --verbose
```

## 📖 API 文档

详细的合约 API 文档请参阅：

- [`docs/合约API速查表.md`](docs/合约API速查表.md) - 快速查找所有合约函数
- [`scripts/zk/README.md`](scripts/zk/README.md) - ZK 证明生成工具链文档
- [`docs/前端交互流程设计.md`](docs/前端交互流程设计.md) - 前端集成指南

## 🛠️ 常用脚本

```json
{
  "build:contracts": "编译智能合约",
  "deploy:local": "部署到本地节点",
  "test": "运行所有测试",
  "test:coverage": "生成测试覆盖率报告",
  "test:gas": "生成 Gas 消耗报告",
  "test:unit": "运行单元测试",
  "test:integration": "运行集成测试",
  "zk:tree": "生成 Merkle 树",
  "zk:compile": "编译 circom 电路",
  "zk:setup": "Groth16 设置",
  "zk:input": "生成证明输入",
  "zk:prove": "生成零知识证明",
  "zk:export": "导出 Solidity 调用数据",
  "zk:full": "一键执行完整 ZK 流程"
}
```

## 🌐 网络配置

项目支持多种网络：

- **hardhatMainnet**: 模拟以太坊主网（本地）
- **hardhatOp**: 模拟 OP Stack L2（本地）
- **sepolia**: Sepolia 测试网（需配置 RPC 和私钥）

配置文件：`hardhat.config.ts`

## 🔒 安全性

- ✅ **OpenZeppelin** 标准化安全合约库
- ✅ **ReentrancyGuard** 防止重入攻击
- ✅ **Pausable** 紧急暂停机制
- ✅ **AccessControl** 细粒度权限控制
- ✅ **SafeERC20** 安全的代币转账
- ✅ **Nullifier** 防止重复理赔
- ✅ **Groth16 ZK-SNARK** 密码学级别的隐私保护

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出改进建议！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feat/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feat/amazing-feature`)
5. 提交 Pull Request

### 提交规范

采用[约定式提交](https://www.conventionalcommits.org/zh-hans/)规范：

- `feat: 新功能`
- `fix: 修复 Bug`
- `docs: 文档更新`
- `style: 代码格式调整`
- `refactor: 代码重构`
- `test: 测试相关`
- `chore: 构建/工具链更新`

## 📝 License

MIT License

## 📧 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。

---

**最后更新**: 2026-02-02  
**版本**: 1.0.0  
**Hardhat 版本**: 3.1.5  
**Solidity 版本**: 0.8.28
