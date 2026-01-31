import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deployWithRolesFixture,
  getZKProofData,
} from "./helpers/fixtures.js";
import {
  TEST_AMOUNTS,
  TEST_DURATIONS,
  TEST_DATA_HASH,
  bigIntToBytes32,
  randomNullifier,
} from "./helpers/constants.js";
import { loadCoveredTreeData } from "./helpers/zkProofLoader.js";

describe("完整业务流程集成测试", () => {
  it("完整理赔流程：创建产品 -> 购买保单 -> 提交理赔 -> 批准 -> 支付", async () => {
    const { insurance, token, insurer, user1, publicClient } = await deployWithRolesFixture();
    
    // ===== 1. 保险公司创建产品 =====
    const treeData = loadCoveredTreeData();
    const coveredRoot = bigIntToBytes32(BigInt(treeData.root));
    
    console.log("步骤 1: 保险公司创建产品");
    const createProductHash = await insurance.write.createProduct(
      [
        token.address,
        TEST_AMOUNTS.PREMIUM,
        TEST_AMOUNTS.MAX_COVERAGE,
        TEST_DURATIONS.COVERAGE_PERIOD_DAYS,
        coveredRoot,
        "ipfs://medical-insurance-product-1",
      ],
      { account: insurer.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: createProductHash });

    const productId = 1n;
    const product = await insurance.read.products([productId]);
    assert.equal(product[7], true); // active
    assert.equal(product[3], TEST_AMOUNTS.PREMIUM); // premiumAmount
    console.log("✓ 产品创建成功");

    // ===== 2. 保险公司为产品池注资 =====
    console.log("步骤 2: 保险公司为产品池注资");
    await token.write.approve([insurance.address, TEST_AMOUNTS.POOL_FUNDING], {
      account: insurer.account,
    });
    const fundHash = await insurance.write.fundPool([productId, TEST_AMOUNTS.POOL_FUNDING], {
      account: insurer.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });

    const pool = await insurance.read.productPool([productId]);
    assert.equal(pool, TEST_AMOUNTS.POOL_FUNDING);
    console.log(`✓ 资金池注资成功: ${TEST_AMOUNTS.POOL_FUNDING}`);

    // ===== 3. 用户购买保单 =====
    console.log("步骤 3: 用户购买保单");
    const userInitialBalance = await token.read.balanceOf([user1.account.address]);
    
    await token.write.approve([insurance.address, TEST_AMOUNTS.PREMIUM], {
      account: user1.account,
    });
    const buyPolicyHash = await insurance.write.buyPolicy([productId], {
      account: user1.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: buyPolicyHash });

    const policyId = 1n;
    const policy = await insurance.read.policies([policyId]);
    assert.equal(policy[2].toLowerCase(), user1.account.address.toLowerCase()); // holder
    assert.equal(policy[5], 0); // PolicyStatus.Active
    
    const userBalanceAfterPurchase = await token.read.balanceOf([user1.account.address]);
    assert.equal(userInitialBalance - userBalanceAfterPurchase, TEST_AMOUNTS.PREMIUM);
    console.log("✓ 保单购买成功");

    // ===== 4. 用户提交 ZK 理赔证明 =====
    console.log("步骤 4: 用户提交 ZK 理赔证明");
    const zkProof = getZKProofData();
    
    const submitClaimHash = await insurance.write.submitClaimWithProof(
      [
        policyId,
        zkProof.publicSignals[1],
        TEST_DATA_HASH,
        bigIntToBytes32(zkProof.publicSignals[4]),
        zkProof.pA,
        zkProof.pB,
        zkProof.pC,
        zkProof.publicSignals,
      ],
      { account: user1.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: submitClaimHash });

    const claimId = 1n;
    let claim = await insurance.read.claims([claimId]);
    assert.equal(claim[7], 1); // ClaimStatus.Verified
    assert.equal(claim[3], zkProof.publicSignals[1]); // amount
    console.log("✓ 理赔证明提交并验证成功");

    // ===== 5. 保险公司批准理赔 =====
    console.log("步骤 5: 保险公司批准理赔");
    const approveHash = await insurance.write.approveClaim([claimId], {
      account: insurer.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    claim = await insurance.read.claims([claimId]);
    assert.equal(claim[7], 2); // ClaimStatus.Approved
    console.log("✓ 理赔批准成功");

    // ===== 6. 保险公司支付理赔 =====
    console.log("步骤 6: 保险公司支付理赔");
    const poolBeforePayout = await insurance.read.productPool([productId]);
    
    const payoutHash = await insurance.write.payoutClaim([claimId], {
      account: insurer.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: payoutHash });

    claim = await insurance.read.claims([claimId]);
    assert.equal(claim[7], 4); // ClaimStatus.Paid
    
    const poolAfterPayout = await insurance.read.productPool([productId]);
    assert.equal(poolBeforePayout - poolAfterPayout, TEST_AMOUNTS.CLAIM_AMOUNT);
    
    const userFinalBalance = await token.read.balanceOf([user1.account.address]);
    assert.equal(userFinalBalance - userBalanceAfterPurchase, TEST_AMOUNTS.CLAIM_AMOUNT);
    console.log("✓ 理赔支付成功");

    console.log("\n✅ 完整理赔流程测试通过！");
  });

  it("多用户多保单场景", async () => {
    const { insurance, token, insurer, user1, user2, publicClient } = await deployWithRolesFixture();
    
    console.log("多用户多保单场景测试");
    
    // 创建产品
    const treeData = loadCoveredTreeData();
    const coveredRoot = bigIntToBytes32(BigInt(treeData.root));
    
    await insurance.write.createProduct(
      [
        token.address,
        TEST_AMOUNTS.PREMIUM,
        TEST_AMOUNTS.MAX_COVERAGE,
        TEST_DURATIONS.COVERAGE_PERIOD_DAYS,
        coveredRoot,
        "ipfs://product-1",
      ],
      { account: insurer.account }
    );

    const productId = 1n;

    // 注资
    await token.write.approve([insurance.address, TEST_AMOUNTS.POOL_FUNDING], {
      account: insurer.account,
    });
    await insurance.write.fundPool([productId, TEST_AMOUNTS.POOL_FUNDING], {
      account: insurer.account,
    });

    // user1 购买保单
    await token.write.approve([insurance.address, TEST_AMOUNTS.PREMIUM], {
      account: user1.account,
    });
    await insurance.write.buyPolicy([productId], {
      account: user1.account,
    });

    // user2 购买保单
    await token.write.approve([insurance.address, TEST_AMOUNTS.PREMIUM], {
      account: user2.account,
    });
    await insurance.write.buyPolicy([productId], {
      account: user2.account,
    });

    // 验证两个保单都创建成功
    const policyCount = await insurance.read.policiesCount();
    assert.equal(policyCount, 2n);

    const policy1 = await insurance.read.policies([1n]);
    const policy2 = await insurance.read.policies([2n]);
    
    assert.equal(policy1[2].toLowerCase(), user1.account.address.toLowerCase()); // holder
    assert.equal(policy2[2].toLowerCase(), user2.account.address.toLowerCase()); // holder
    
    // 验证用户专属查询
    const user1PoliciesCount = await insurance.read.userPoliciesCount([user1.account.address]);
    const user2PoliciesCount = await insurance.read.userPoliciesCount([user2.account.address]);
    
    assert.equal(user1PoliciesCount, 1n);
    assert.equal(user2PoliciesCount, 1n);

    console.log("✓ 多用户多保单场景测试通过");
  });

  it("资金池管理场景：注资、理赔、余额不足", async () => {
    const { insurance, token, insurer, user1, publicClient } = await deployWithRolesFixture();
    
    console.log("资金池管理场景测试");
    
    // 创建产品
    const treeData = loadCoveredTreeData();
    const coveredRoot = bigIntToBytes32(BigInt(treeData.root));
    
    await insurance.write.createProduct(
      [
        token.address,
        TEST_AMOUNTS.PREMIUM,
        TEST_AMOUNTS.MAX_COVERAGE,
        TEST_DURATIONS.COVERAGE_PERIOD_DAYS,
        coveredRoot,
        "ipfs://product-1",
      ],
      { account: insurer.account }
    );

    const productId = 1n;

    // 初始注资（仅注入少量资金）
    const smallFunding = TEST_AMOUNTS.CLAIM_AMOUNT / 2n;
    await token.write.approve([insurance.address, smallFunding], {
      account: insurer.account,
    });
    await insurance.write.fundPool([productId, smallFunding], {
      account: insurer.account,
    });

    let pool = await insurance.read.productPool([productId]);
    console.log(`初始资金池: ${pool}`);

    // 用户购买保单（保费会增加资金池）
    await token.write.approve([insurance.address, TEST_AMOUNTS.PREMIUM], {
      account: user1.account,
    });
    await insurance.write.buyPolicy([productId], {
      account: user1.account,
    });

    pool = await insurance.read.productPool([productId]);
    assert.equal(pool, smallFunding + TEST_AMOUNTS.PREMIUM);
    console.log(`购买保单后资金池: ${pool}`);

    // 追加注资
    const additionalFunding = TEST_AMOUNTS.POOL_FUNDING;
    await token.write.approve([insurance.address, additionalFunding], {
      account: insurer.account,
    });
    await insurance.write.fundPool([productId, additionalFunding], {
      account: insurer.account,
    });

    pool = await insurance.read.productPool([productId]);
    assert.equal(pool >= TEST_AMOUNTS.CLAIM_AMOUNT, true);
    console.log(`追加注资后资金池: ${pool}`);

    // 提交理赔并支付
    const zkProof = getZKProofData();
    const policyId = 1n;
    
    await insurance.write.submitClaimWithProof(
      [
        policyId,
        zkProof.publicSignals[1],
        TEST_DATA_HASH,
        bigIntToBytes32(zkProof.publicSignals[4]),
        zkProof.pA,
        zkProof.pB,
        zkProof.pC,
        zkProof.publicSignals,
      ],
      { account: user1.account }
    );

    await insurance.write.approveClaim([1n], {
      account: insurer.account,
    });

    const poolBeforePayout = await insurance.read.productPool([productId]);
    
    await insurance.write.payoutClaim([1n], {
      account: insurer.account,
    });

    const poolAfterPayout = await insurance.read.productPool([productId]);
    assert.equal(poolBeforePayout - poolAfterPayout, TEST_AMOUNTS.CLAIM_AMOUNT);
    console.log(`支付理赔后资金池: ${poolAfterPayout}`);

    console.log("✓ 资金池管理场景测试通过");
  });

  it("产品生命周期管理：创建、激活、禁用、更新", async () => {
    const { insurance, token, insurer, user1, publicClient } = await deployWithRolesFixture();
    
    console.log("产品生命周期管理测试");
    
    // 创建产品
    const treeData = loadCoveredTreeData();
    const coveredRoot = bigIntToBytes32(BigInt(treeData.root));
    
    await insurance.write.createProduct(
      [
        token.address,
        TEST_AMOUNTS.PREMIUM,
        TEST_AMOUNTS.MAX_COVERAGE,
        TEST_DURATIONS.COVERAGE_PERIOD_DAYS,
        coveredRoot,
        "ipfs://product-v1",
      ],
      { account: insurer.account }
    );

    const productId = 1n;
    let product = await insurance.read.products([productId]);
    assert.equal(product[7], true); // active
    console.log("✓ 产品创建成功并激活");

    // 禁用产品
    await insurance.write.setProductActive([productId, false], {
      account: insurer.account,
    });

    product = await insurance.read.products([productId]);
    assert.equal(product[7], false); // active
    console.log("✓ 产品已禁用");

    // 尝试购买禁用的产品（应该失败）
    await token.write.approve([insurance.address, TEST_AMOUNTS.PREMIUM], {
      account: user1.account,
    });

    await assert.rejects(
      async () => {
        await insurance.write.buyPolicy([productId], {
          account: user1.account,
        });
      },
      /ProductNotActive/
    );
    console.log("✓ 禁用的产品无法购买");

    // 重新激活产品
    await insurance.write.setProductActive([productId, true], {
      account: insurer.account,
    });

    product = await insurance.read.products([productId]);
    assert.equal(product[7], true); // active
    console.log("✓ 产品重新激活");

    // 更新 coveredRoot
    const newRoot = bigIntToBytes32(99999n);
    await insurance.write.updateCoveredRoot([productId, newRoot], {
      account: insurer.account,
    });

    product = await insurance.read.products([productId]);
    assert.equal(product[6], newRoot); // coveredRoot
    console.log("✓ coveredRoot 更新成功");

    console.log("✓ 产品生命周期管理测试通过");
  });

  it("理赔拒绝流程", async () => {
    const { insurance, token, insurer, user1, publicClient } = await deployWithRolesFixture();
    
    console.log("理赔拒绝流程测试");
    
    // 创建产品并购买保单
    const treeData = loadCoveredTreeData();
    const coveredRoot = bigIntToBytes32(BigInt(treeData.root));
    
    await insurance.write.createProduct(
      [
        token.address,
        TEST_AMOUNTS.PREMIUM,
        TEST_AMOUNTS.MAX_COVERAGE,
        TEST_DURATIONS.COVERAGE_PERIOD_DAYS,
        coveredRoot,
        "ipfs://product-1",
      ],
      { account: insurer.account }
    );

    const productId = 1n;

    await token.write.approve([insurance.address, TEST_AMOUNTS.POOL_FUNDING], {
      account: insurer.account,
    });
    await insurance.write.fundPool([productId, TEST_AMOUNTS.POOL_FUNDING], {
      account: insurer.account,
    });

    await token.write.approve([insurance.address, TEST_AMOUNTS.PREMIUM], {
      account: user1.account,
    });
    await insurance.write.buyPolicy([productId], {
      account: user1.account,
    });

    const policyId = 1n;

    // 提交理赔
    const zkProof = getZKProofData();
    await insurance.write.submitClaimWithProof(
      [
        policyId,
        zkProof.publicSignals[1],
        TEST_DATA_HASH,
        bigIntToBytes32(zkProof.publicSignals[4]),
        zkProof.pA,
        zkProof.pB,
        zkProof.pC,
        zkProof.publicSignals,
      ],
      { account: user1.account }
    );

    const claimId = 1n;
    let claim = await insurance.read.claims([claimId]);
    assert.equal(claim[7], 1); // ClaimStatus.Verified
    console.log("✓ 理赔提交成功");

    // 保险公司拒绝理赔
    const rejectReason = bigIntToBytes32(888n);
    await insurance.write.rejectClaim([claimId, rejectReason], {
      account: insurer.account,
    });

    claim = await insurance.read.claims([claimId]);
    assert.equal(claim[7], 3); // ClaimStatus.Rejected
    assert.equal(claim[11], rejectReason); // decisionMemoHash
    console.log("✓ 理赔已拒绝");

    // 尝试支付被拒绝的理赔（应该失败）
    await assert.rejects(
      async () => {
        await insurance.write.payoutClaim([claimId], {
          account: insurer.account,
        });
      },
      /ClaimNotInExpectedStatus/
    );
    console.log("✓ 被拒绝的理赔无法支付");

    console.log("✓ 理赔拒绝流程测试通过");
  });
});
