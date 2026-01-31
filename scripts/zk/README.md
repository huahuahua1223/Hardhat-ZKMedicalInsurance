# ZK 零知识证明构建流程

本目录包含医疗保险零知识证明系统的完整构建脚本。

## 📋 完整流程

使用 `pnpm hardhat run` 执行以下脚本：

```
1. build-covered-tree.ts   → 生成 Merkle 树
2. 01-compile.ts          → 编译 circom 电路
3. 02-setup-groth16.ts    → Groth16 设置
4. make-claim-input.ts    → 生成证明输入
5. 03-prove.ts            → 生成零知识证明
6. export-calldata.ts     → 导出 Solidity 调用数据
```

### 📦 快速开始（使用 npm scripts）

```powershell
# 1. 生成 Merkle 树
pnpm zk:tree

# 2. 编译 circom 电路
pnpm zk:compile

# 3. 执行 Groth16 设置
pnpm zk:setup

# 4. 生成证明输入
pnpm zk:input

# 5. 生成零知识证明
pnpm zk:prove

# 6. 导出 Solidity 调用数据
pnpm zk:export

# 🚀 一键执行完整流程
pnpm zk:full
```

### 🔧 详细步骤（手动执行）

#### 步骤 1: 生成 Merkle 树

```powershell
pnpm hardhat run scripts/zk/build-covered-tree.ts
```

**作用**: 从疾病列表生成 Poseidon Merkle 树  
**输入**: `diseases.json` - 疾病 ID 列表  
**输出**: `coveredTree.json` - Merkle 树数据（root、leaves、paths）

**配置参数** (`.env`):
```env
DEPTH=16                 # Merkle 树深度（默认 16，支持 2^16 = 65536 个叶子）
DISEASES=diseases.json   # 疾病列表文件路径
```

#### 步骤 2: 编译 circom 电路

```powershell
pnpm hardhat run scripts/zk/01-compile.ts
```

**作用**: 将 circom 电路编译为 R1CS + WASM  
**输入**: `circuits/medical_claim.circom`  
**输出**:
- `zkbuild/medical_claim.r1cs` - R1CS 约束系统
- `zkbuild/medical_claim_js/` - WASM 执行文件
- `zkbuild/medical_claim.sym` - 符号表

**时间**: ~10 秒

#### 步骤 3: Groth16 设置

```powershell
pnpm hardhat run scripts/zk/02-setup-groth16.ts
```

**作用**: 执行 Powers of Tau 仪式和生成 zkey  
**输入**: `zkbuild/medical_claim.r1cs`  
**输出**:
- `zkbuild/pot15_final.ptau` - Powers of Tau 文件（支持 ~32k 约束）
- `zkbuild/medical_claim_final.zkey` - 最终 zkey
- `zkbuild/verification_key.json` - 验证密钥

**时间**: ~5-10 分钟（仅需执行一次）

#### 步骤 4: 生成证明输入

```powershell
pnpm hardhat run scripts/zk/make-claim-input.ts
```

**作用**: 生成零知识证明的输入 JSON  
**输入**: `.env` 中的配置参数、`coveredTree.json`  
**输出**: `claimInput.json` - 证明输入数据

**配置参数** (`.env`):
```env
POLICY_ID=1              # 保单 ID
AMOUNT=1000000           # 理赔金额
DATA_HASH=0x111...       # 数据哈希（32 字节）
LEAF_INDEX=0             # Merkle 树叶子索引
DISEASE_ID=101           # 疾病 ID
SECRET=123456789         # 用户密钥（用于生成 nullifier）
TREE=coveredTree.json    # Merkle 树文件路径
OUT=claimInput.json      # 输出文件路径
```

#### 步骤 5: 生成零知识证明

```powershell
pnpm hardhat run scripts/zk/03-prove.ts
```

**作用**: 生成 Groth16 零知识证明  
**输入**: `claimInput.json`、`zkbuild/medical_claim_final.zkey`  
**输出**:
- `zkbuild/proof.json` - 零知识证明
- `zkbuild/public.json` - 公开输入

**时间**: ~10-30 秒

#### 步骤 6: 导出 Solidity 调用数据

```powershell
pnpm hardhat run scripts/zk/export-calldata.ts
```

**作用**: 格式化证明数据为 Solidity 函数调用格式  
**输入**: `zkbuild/proof.json`、`zkbuild/public.json`  
**输出**: 控制台打印 Solidity 调用参数

**输出格式**:
```javascript
// 用于合约调用的参数
_pA = [uint256(...), uint256(...)]
_pB = [[uint256(...), uint256(...)], [uint256(...), uint256(...)]]
_pC = [uint256(...), uint256(...)]
_pubSignals = [uint256(...), uint256(...), ...]
```

## 📁 目录结构

```
scripts/zk/
├── build-covered-tree.ts    # 步骤 1: Merkle 树生成
├── 01-compile.ts            # 步骤 2: circom 编译
├── 02-setup-groth16.ts      # 步骤 3: Groth16 设置
├── make-claim-input.ts      # 步骤 4: 生成证明输入
├── 03-prove.ts              # 步骤 5: 生成证明
├── export-calldata.ts       # 步骤 6: 导出调用数据
├── 01-compile.sh            # Bash 版本（可选）
├── 02-setup-groth16.sh      # Bash 版本（可选）
├── 03-prove.sh              # Bash 版本（可选）
└── README.md                # 本文件

zkbuild/                     # 构建输出目录（.gitignore）
├── medical_claim.r1cs       # R1CS 约束（编译输出）
├── medical_claim_js/        # WASM 文件（编译输出）
│   ├── medical_claim.wasm   # 电路执行文件
│   ├── witness_calculator.js
│   └── ...
├── medical_claim.sym        # 符号表（调试用）
├── pot15_0000.ptau          # Powers of Tau 中间文件
├── pot15_0001.ptau          # Powers of Tau 中间文件
├── pot15_final.ptau         # Powers of Tau 最终文件
├── medical_claim_0000.zkey  # zkey 中间文件
├── medical_claim_final.zkey # zkey 最终文件
├── verification_key.json    # 验证密钥
├── proof.json               # 零知识证明
└── public.json              # 公开输入

circuits/
└── medical_claim.circom     # circom 电路源码

diseases.json                # 输入: 疾病列表 [101, 102, 103, ...]
coveredTree.json             # 输出: Merkle 树数据
claimInput.json              # 输出: 证明输入
.env                         # 配置文件（需手动创建）
.env.example                 # 配置模板
```

## ⚙️ 配置说明

所有配置参数通过 `.env` 文件设置。复制 `.env.example` 并修改：

```powershell
# 如果没有 .env 文件，复制模板
Copy-Item .env.example .env

# 然后编辑 .env
notepad .env
```

### 完整配置示例

```env
# ============================================
# Hardhat 网络配置
# ============================================
HARDHAT_NETWORK=localhost

# ============================================
# Merkle 树配置
# ============================================
DEPTH=16                     # Merkle 树深度（默认 16）
DISEASES=diseases.json       # 疾病列表文件

# ============================================
# ZK 证明输入配置
# ============================================
POLICY_ID=1                  # 保单 ID
AMOUNT=1000000               # 理赔金额（单位：wei 或最小单位）
DATA_HASH=0x1111111111111111111111111111111111111111111111111111111111111111
LEAF_INDEX=0                 # Merkle 树叶子索引（0-based）
DISEASE_ID=101               # 疾病 ID（必须在 diseases.json 中）
SECRET=123456789             # 用户密钥（用于生成 nullifier）

# ============================================
# ZK 文件路径配置（可选）
# ============================================
TREE=coveredTree.json        # Merkle 树文件路径（默认）
OUT=claimInput.json          # 输出文件路径（默认）

# 证明文件路径（export-calldata.ts 使用）
# ⚠️ 注意：不要使用 PUBLIC，它是 Windows 系统环境变量！
PROOF_FILE=zkbuild/proof.json      # 证明文件路径（默认）
PUBLIC_FILE=zkbuild/public.json    # 公开输入路径（默认）
```

⚠️ **重要提示**:
- 不要使用 `PUBLIC` 作为环境变量名，它是 Windows 系统变量！详见 `WINDOWS-ENV-VAR-FIX.md`
- `DATA_HASH` 必须是 32 字节的十六进制字符串（0x 开头，64 个字符）
- `DISEASE_ID` 必须存在于 `diseases.json` 中
- `LEAF_INDEX` 应该对应 Merkle 树中 `DISEASE_ID` 的位置

## 🛠️ 环境要求

### 必需工具

1. **Node.js** (v18+) ✅
2. **pnpm** ✅
3. **circom 编译器** (v2.x) - 需要手动安装
4. **snarkjs** - 已在 package.json 中 ✅
5. **circomlib** - 已在 package.json 中 ✅

### 安装 circom

#### Windows（推荐方式）

1. 访问 https://github.com/iden3/circom/releases
2. 下载 `circom-windows-amd64.exe`
3. 重命名为 `circom.exe`
4. 放到 `C:\Windows\System32\` 或添加到 PATH

#### macOS/Linux

```bash
# 下载二进制
curl -L https://github.com/iden3/circom/releases/download/v2.2.1/circom-linux-amd64 -o /usr/local/bin/circom
chmod +x /usr/local/bin/circom

# 验证安装
circom --version  # 应该显示 circom compiler 2.2.1
```

#### 验证安装

```powershell
# 检查 circom
circom --version

# 检查 snarkjs
pnpm snarkjs --help
```

## 🔍 故障排查

### 错误 1: `circom: command not found`

**原因**: circom 未安装或未添加到 PATH

**解决方案**:
1. 按照上面的步骤安装 circom
2. 确保 `circom.exe` 在系统 PATH 中
3. 重启 PowerShell/终端

### 错误 2: `The file circomlib/circuits/poseidon.circom to be included has not been found`

**原因**: circomlib 路径配置问题

**解决方案**:
- 脚本已经配置了正确的 `-l` 参数
- 如果还有问题，检查 `node_modules/.pnpm/circomlib@2.0.5/node_modules` 是否存在
- 尝试重新安装：`pnpm install`

### 错误 3: `circuit too big for this power of tau ceremony`

**原因**: 电路约束数量超过 Powers of Tau 容量

**解决方案**:
- 当前配置使用 `PTAU_POWER=15`（支持 ~32k 约束）
- 如果电路更大，在 `02-setup-groth16.ts` 中增加 `PTAU_POWER`
- 详见 `POWERS-OF-TAU-FIX.md`

### 错误 4: `Error: EISDIR: illegal operation on a directory, read`

**原因**: Windows 环境变量 `PUBLIC` 冲突

**解决方案**:
- 使用 `PUBLIC_FILE` 代替 `PUBLIC`
- 详见 `WINDOWS-ENV-VAR-FIX.md`

### 错误 5: `Non quadratic constraints are not allowed`

**原因**: circom 电路中存在非二次约束

**解决方案**:
- 已在 `circuits/medical_claim.circom` 中修复
- 详见 `CIRCOM-QUADRATIC-FIX.md` 和 `COMPILE-FIX.md`

### 错误 6: `Signal or component declaration inside While scope`

**原因**: circom 2.x 不允许在循环内声明信号/组件

**解决方案**:
- 已在 `circuits/medical_claim.circom` 中修复
- 所有信号/组件都在循环外以数组形式声明
- 详见 `COMPILE-FIX.md`

### 错误 7: 证明生成失败

**可能原因**:
1. 输入数据格式错误
2. `claimInput.json` 中的值不满足电路约束
3. zkey 文件损坏

**排查步骤**:
```powershell
# 1. 检查输入文件
cat claimInput.json

# 2. 重新生成输入
pnpm zk:input

# 3. 如果还失败，重新执行 setup
pnpm zk:setup
pnpm zk:prove
```

## 📚 相关文档

- `ENV-GUIDE.md` - 环境变量详细配置指南
- `COMPILE-FIX.md` - circom 编译问题修复记录
- `CIRCOM-QUADRATIC-FIX.md` - 二次约束修复详解
- `POWERS-OF-TAU-FIX.md` - Powers of Tau 参数调整
- `WINDOWS-ENV-VAR-FIX.md` - Windows 环境变量冲突解决
- `ZK-PROOF-SUCCESS.md` - 成功生成证明后的下一步

## 💡 最佳实践

### 1. 首次使用

```powershell
# 完整初始化流程（只需执行一次）
pnpm zk:tree      # 生成 Merkle 树
pnpm zk:compile   # 编译电路（~10秒）
pnpm zk:setup     # 执行 setup（~5-10分钟）
```

### 2. 日常使用

```powershell
# 每次生成新证明时
# 1. 编辑 .env 修改参数
# 2. 生成证明
pnpm zk:input     # 生成输入（使用 .env）
pnpm zk:prove     # 生成证明（~10-30秒）
pnpm zk:export    # 导出调用数据
```

### 3. 调试技巧

```powershell
# 查看生成的文件
ls zkbuild/
cat claimInput.json
cat zkbuild/public.json

# 检查 Merkle 树
cat coveredTree.json | jq .root
cat coveredTree.json | jq .leaves

# 检查疾病列表
cat diseases.json
```

### 4. 性能优化

- **并行执行**: `pnpm zk:full` 会顺序执行所有步骤
- **缓存**: `zkbuild/` 目录可以保留，避免重复 setup
- **跳过步骤**: 如果已经有 `zkbuild/medical_claim_final.zkey`，可以跳过 setup

### 5. 团队协作

```powershell
# 分享 setup 结果（避免每个人都执行 setup）
# 1. 完成 setup 后，压缩 zkbuild/ 目录
Compress-Archive -Path zkbuild/ -DestinationPath zkbuild.zip

# 2. 团队成员下载并解压
Expand-Archive -Path zkbuild.zip -DestinationPath .

# 3. 直接使用
pnpm zk:input
pnpm zk:prove
pnpm zk:export
```

## 🎯 下一步

成功生成证明后：

1. **部署验证合约**:
   - 使用 `zkbuild/verification_key.json` 生成 Solidity 验证器
   - 或使用预生成的 `contracts/Groth16Verifier.sol`

2. **集成到主合约**:
   - 将 `export-calldata.ts` 的输出复制到合约调用中
   - 调用 `ZKMedicalInsurance.submitClaim()` 函数

3. **测试验证**:
   ```powershell
   # 使用 Hardhat 测试
   pnpm hardhat test
   ```

4. **生产部署**:
   - 确保 `.env` 不提交到 git
   - 使用生产环境的疾病列表
   - 考虑使用更大的 Merkle 树深度

## 📞 获取帮助

如果遇到问题：

1. 查看相关文档（`*-FIX.md` 系列）
2. 检查 `.env` 配置是否正确
3. 查看终端完整错误信息
4. 重新运行失败的步骤

常见问题都已在本文档的"故障排查"部分列出。

---

**最后更新**: 2026-01-29  
**版本**: 1.0.0  
**状态**: ✅ 测试通过
