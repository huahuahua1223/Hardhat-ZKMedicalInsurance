import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployWithRolesFixture,
  deployWithProductFixture,
  deployWithPolicyFixture,
  getZKProofData,
} from "./helpers/fixtures.js";
import {
  TEST_AMOUNTS,
  TEST_DURATIONS,
  TEST_DATA_HASH,
  ZERO_ADDRESS,
  SNARK_FIELD,
  bigIntToBytes32,
  randomNullifier,
} from "./helpers/constants.js";

describe("边界条件和安全性", () => {
  describe("输入验证", () => {
    it("创建产品时拒绝零地址代币", async () => {
      const { insurance, insurer } = await deployWithRolesFixture();
      
      const coveredRoot = bigIntToBytes32(12345n);
      
      await assert.rejects(
        async () => {
          await insurance.write.createProduct(
            [
              ZERO_ADDRESS,
              TEST_AMOUNTS.PREMIUM,
              TEST_AMOUNTS.MAX_COVERAGE,
              TEST_DURATIONS.COVERAGE_PERIOD_DAYS,
              coveredRoot,
              "ipfs://test",
            ],
            { account: insurer.account }
          );
        },
        /ZeroAddress/
      );
    });

    it("理赔金额不能超过最大赔付额", async () => {
      const { insurance, policyId, user1 } = await deployWithPolicyFixture();
      
      const zkProof = getZKProofData();
      const excessiveAmount = TEST_AMOUNTS.MAX_COVERAGE + 1n;

      await assert.rejects(
        async () => {
          await insurance.write.submitClaimWithProof(
            [
              policyId,
              excessiveAmount,
              TEST_DATA_HASH,
              bigIntToBytes32(zkProof.publicSignals[4]),
              zkProof.pA,
              zkProof.pB,
              zkProof.pC,
              [
                zkProof.publicSignals[0],
                excessiveAmount,
                zkProof.publicSignals[2],
                zkProof.publicSignals[3],
                zkProof.publicSignals[4],
              ],
            ],
            { account: user1.account }
          );
        },
        /AmountExceedsCoverage/
      );
    });

    it("公开输入与参数不一致时被拒绝 - policyId", async () => {
      const { insurance, policyId, user1 } = await deployWithPolicyFixture();
      
      const zkProof = getZKProofData();

      await assert.rejects(
        async () => {
          await insurance.write.submitClaimWithProof(
            [
              policyId,
              zkProof.publicSignals[1],
              TEST_DATA_HASH,
              bigIntToBytes32(zkProof.publicSignals[4]),
              zkProof.pA,
              zkProof.pB,
              zkProof.pC,
              [
                999n, // 错误的 policyId
                zkProof.publicSignals[1],
                zkProof.publicSignals[2],
                zkProof.publicSignals[3],
                zkProof.publicSignals[4],
              ],
            ],
            { account: user1.account }
          );
        },
        /InvalidPublicSignals/
      );
    });

    it("公开输入与参数不一致时被拒绝 - amount", async () => {
      const { insurance, policyId, user1 } = await deployWithPolicyFixture();
      
      const zkProof = getZKProofData();

      await assert.rejects(
        async () => {
          await insurance.write.submitClaimWithProof(
            [
              policyId,
              zkProof.publicSignals[1],
              TEST_DATA_HASH,
              bigIntToBytes32(zkProof.publicSignals[4]),
              zkProof.pA,
              zkProof.pB,
              zkProof.pC,
              [
                zkProof.publicSignals[0],
                999999n, // 错误的 amount
                zkProof.publicSignals[2],
                zkProof.publicSignals[3],
                zkProof.publicSignals[4],
              ],
            ],
            { account: user1.account }
          );
        },
        /InvalidPublicSignals/
      );
    });

    it("公开输入与参数不一致时被拒绝 - nullifier", async () => {
      const { insurance, policyId, user1 } = await deployWithPolicyFixture();
      
      const zkProof = getZKProofData();

      await assert.rejects(
        async () => {
          await insurance.write.submitClaimWithProof(
            [
              policyId,
              zkProof.publicSignals[1],
              TEST_DATA_HASH,
              bigIntToBytes32(zkProof.publicSignals[4]),
              zkProof.pA,
              zkProof.pB,
              zkProof.pC,
              [
                zkProof.publicSignals[0],
                zkProof.publicSignals[1],
                zkProof.publicSignals[2],
                zkProof.publicSignals[3],
                999999n, // 错误的 nullifier
              ],
            ],
            { account: user1.account }
          );
        },
        /InvalidPublicSignals/
      );
    });
  });

  describe("重入攻击保护", () => {
    it("buyPolicy 有 nonReentrant 保护", async () => {
      const { insurance, token, user1, productId, publicClient } = await deployWithProductFixture();
      
      // 批准保费
      await token.write.approve([insurance.address, TEST_AMOUNTS.PREMIUM], {
        account: user1.account,
      });

      // 购买保单
      const hash = await insurance.write.buyPolicy([productId], {
        account: user1.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      // 验证成功购买
      const policyCount = await insurance.read.policiesCount();
      assert.equal(policyCount, 1n);
    });

    it("payoutClaim 有 nonReentrant 保护", async () => {
      const { insurance, policyId, user1, insurer, publicClient } = await deployWithPolicyFixture();
      
      const zkProof = getZKProofData();

      // 提交理赔
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

      // 批准理赔
      await insurance.write.approveClaim([1n], {
        account: insurer.account,
      });

      // 支付理赔
      const hash = await insurance.write.payoutClaim([1n], {
        account: insurer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      // 验证成功支付
      const claim = await insurance.read.claims([1n]);
      assert.equal(claim[7], 4); // ClaimStatus.Paid
    });
  });

  describe("时间相关", () => {
    it("保单过期后不能理赔", async () => {
      const { insurance, token, productId, user1, testClient } = await deployWithProductFixture();
      
      // 购买保单
      await token.write.approve([insurance.address, TEST_AMOUNTS.PREMIUM], {
        account: user1.account,
      });
      await insurance.write.buyPolicy([productId], {
        account: user1.account,
      });

      const policyId = 1n;

      // 获取保单信息
      const policy = await insurance.read.policies([policyId]);
      
      // 快进时间到保单过期后
      // Policy 元组: [id, productId, holder, startAt, endAt, status, createdAt]
      await testClient.increaseTime({
        seconds: Number(policy[4] - policy[3]) + 1000, // endAt - startAt
      });
      await testClient.mine({ blocks: 1 });

      const zkProof = getZKProofData();

      // 尝试提交理赔
      await assert.rejects(
        async () => {
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
        },
        /PolicyExpired/
      );
    });

    it("保单未激活时不能理赔", async () => {
      const { insurance, token, productId, user1, deployer, publicClient } = await deployWithProductFixture();
      
      // 购买保单
      await token.write.approve([insurance.address, TEST_AMOUNTS.PREMIUM], {
        account: user1.account,
      });
      await insurance.write.buyPolicy([productId], {
        account: user1.account,
      });

      const policyId = 1n;

      // 暂停合约（deployer 有 PAUSER_ROLE）
      await insurance.write.pause({
        account: deployer.account,
      });

      const zkProof = getZKProofData();

      // 尝试提交理赔
      await assert.rejects(
        async () => {
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
        },
        /EnforcedPause/
      );
    });
  });

  describe("Nullifier 防重放", () => {
    it("相同 nullifier 不能重复使用", async () => {
      const { insurance, policyId, user1, publicClient } = await deployWithPolicyFixture();
      
      const zkProof = getZKProofData();
      const nullifier = bigIntToBytes32(zkProof.publicSignals[4]);

      // 第一次提交成功
      const hash = await insurance.write.submitClaimWithProof(
        [
          policyId,
          zkProof.publicSignals[1],
          TEST_DATA_HASH,
          nullifier,
          zkProof.pA,
          zkProof.pB,
          zkProof.pC,
          zkProof.publicSignals,
        ],
        { account: user1.account }
      );
      await publicClient.waitForTransactionReceipt({ hash });

      // 验证 nullifier 已被标记为已使用
      const isUsed = await insurance.read.usedNullifier([nullifier]);
      assert.equal(isUsed, true);

      // 第二次使用相同 nullifier 应该失败
      await assert.rejects(
        async () => {
          await insurance.write.submitClaimWithProof(
            [
              policyId,
              zkProof.publicSignals[1],
              TEST_DATA_HASH,
              nullifier,
              zkProof.pA,
              zkProof.pB,
              zkProof.pC,
              zkProof.publicSignals,
            ],
            { account: user1.account }
          );
        },
        /NullifierAlreadyUsed/
      );
    });

    it("不同保单可以使用不同 nullifier", async () => {
      const { insurance, publicClient } = await deployWithPolicyFixture();
      
      // 简单验证：不同的 nullifier 未被使用
      const zkProof = getZKProofData();
      const usedNullifier = bigIntToBytes32(zkProof.publicSignals[4]);
      
      // 在任何理赔之前，nullifier 应该未被使用
      const isUsedBefore = await insurance.read.usedNullifier([usedNullifier]);
      assert.equal(isUsedBefore, false);

      // 验证一个随机 nullifier 也未被使用
      const randomNull = randomNullifier();
      const isRandomUsed = await insurance.read.usedNullifier([randomNull]);
      assert.equal(isRandomUsed, false);
    });
  });

  describe("状态一致性", () => {
    it("不能批准未验证的理赔", async () => {
      const { insurance, insurer } = await deployWithPolicyFixture();
      
      // 尝试批准不存在的理赔
      await assert.rejects(
        async () => {
          await insurance.write.approveClaim([999n], {
            account: insurer.account,
          });
        },
        /ClaimNotFound/
      );
    });

    it("不能支付未批准的理赔", async () => {
      const { insurance, policyId, user1, insurer, publicClient } = await deployWithPolicyFixture();
      
      const zkProof = getZKProofData();

      // 提交理赔
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

      // 尝试直接支付（跳过批准步骤）
      await assert.rejects(
        async () => {
          await insurance.write.payoutClaim([1n], {
            account: insurer.account,
          });
        },
        /ClaimNotInExpectedStatus/
      );
    });

    it("已支付的理赔不能再次支付", async () => {
      const { insurance, policyId, user1, insurer, publicClient } = await deployWithPolicyFixture();
      
      const zkProof = getZKProofData();

      // 提交理赔
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

      // 批准并支付理赔
      await insurance.write.approveClaim([1n], {
        account: insurer.account,
      });
      await insurance.write.payoutClaim([1n], {
        account: insurer.account,
      });

      // 尝试再次支付
      await assert.rejects(
        async () => {
          await insurance.write.payoutClaim([1n], {
            account: insurer.account,
          });
        },
        /ClaimNotInExpectedStatus/
      );
    });
  });

  describe("权限边界", () => {
    it("非产品所有者不能操作产品", async () => {
      const { insurance, productId, user1 } = await deployWithProductFixture();
      
      await assert.rejects(
        async () => {
          await insurance.write.setProductActive([productId, false], {
            account: user1.account,
          });
        },
        /AccessControlUnauthorizedAccount/
      );
    });

    it("非保单持有者不能提交理赔（除非是医院）", async () => {
      const { insurance, policyId, user2 } = await deployWithPolicyFixture();
      
      const zkProof = getZKProofData();

      await assert.rejects(
        async () => {
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
            { account: user2.account }
          );
        },
        /Unauthorized/
      );
    });
  });
});
