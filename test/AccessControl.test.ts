import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
  bigIntToBytes32,
} from "./helpers/constants.js";

describe("角色权限控制", () => {
  describe("INSURER_ROLE", () => {
    it("可以创建产品", async () => {
      const { insurance, token, insurer, publicClient } = await deployWithRolesFixture();
      
      const coveredRoot = bigIntToBytes32(12345n);
      
      const hash = await insurance.write.createProduct(
        [
          token.address,
          TEST_AMOUNTS.PREMIUM,
          TEST_AMOUNTS.MAX_COVERAGE,
          TEST_DURATIONS.COVERAGE_PERIOD_DAYS,
          coveredRoot,
          "ipfs://test",
        ],
        { account: insurer.account }
      );

      await publicClient.waitForTransactionReceipt({ hash });
      
      const count = await insurance.read.productsCount();
      assert.equal(count, 1n);
    });

    it("可以批准理赔", async () => {
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
      const hash = await insurance.write.approveClaim([1n], {
        account: insurer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const claim = await insurance.read.claims([1n]);
      assert.equal(claim[7], 2); // ClaimStatus.Approved
    });

    it("可以拒绝理赔", async () => {
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

      // 拒绝理赔
      const rejectReason = bigIntToBytes32(999n);
      const hash = await insurance.write.rejectClaim([1n, rejectReason], {
        account: insurer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const claim = await insurance.read.claims([1n]);
      assert.equal(claim[7], 3); // ClaimStatus.Rejected
    });

    it("可以支付理赔", async () => {
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

      const claim = await insurance.read.claims([1n]);
      assert.equal(claim[7], 4); // ClaimStatus.Paid
    });

    it("可以为资金池注资", async () => {
      const { insurance, token, productId, insurer, publicClient } = await deployWithProductFixture();
      
      const fundAmount = 5000000n;
      
      await token.write.approve([insurance.address, fundAmount], {
        account: insurer.account,
      });

      const hash = await insurance.write.fundPool([productId, fundAmount], {
        account: insurer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const pool = await insurance.read.productPool([productId]);
      assert.equal(pool >= fundAmount, true);
    });
  });

  describe("HOSPITAL_ROLE", () => {
    it("可以代理提交理赔", async () => {
      const { insurance, policyId, hospital, publicClient } = await deployWithPolicyFixture();
      
      const zkProof = getZKProofData();

      // 医院代理提交理赔
      const hash = await insurance.write.submitClaimWithProof(
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
        { account: hospital.account }
      );
      await publicClient.waitForTransactionReceipt({ hash });

      const count = await insurance.read.claimsCount();
      assert.equal(count, 1n);
    });

    it("不能创建产品", async () => {
      const { insurance, token, hospital } = await deployWithRolesFixture();
      
      const coveredRoot = bigIntToBytes32(12345n);
      
      await assert.rejects(
        async () => {
          await insurance.write.createProduct(
            [
              token.address,
              TEST_AMOUNTS.PREMIUM,
              TEST_AMOUNTS.MAX_COVERAGE,
              TEST_DURATIONS.COVERAGE_PERIOD_DAYS,
              coveredRoot,
              "ipfs://test",
            ],
            { account: hospital.account }
          );
        },
        /AccessControl/
      );
    });

    it("不能批准理赔", async () => {
      const { insurance, policyId, user1, hospital, publicClient } = await deployWithPolicyFixture();
      
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

      // 医院尝试批准理赔
      await assert.rejects(
        async () => {
          await insurance.write.approveClaim([1n], {
            account: hospital.account,
          });
        },
        /AccessControl/
      );
    });
  });

  describe("PAUSER_ROLE", () => {
    it("可以暂停合约", async () => {
      const { insurance, deployer, publicClient } = await deployWithRolesFixture();
      
      const hash = await insurance.write.pause({
        account: deployer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const paused = await insurance.read.paused();
      assert.equal(paused, true);
    });

    it("可以恢复合约", async () => {
      const { insurance, deployer, publicClient } = await deployWithRolesFixture();
      
      // 先暂停
      await insurance.write.pause({
        account: deployer.account,
      });

      // 再恢复
      const hash = await insurance.write.unpause({
        account: deployer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const paused = await insurance.read.paused();
      assert.equal(paused, false);
    });

    it("暂停后不能购买保单", async () => {
      const { insurance, token, user1, productId, deployer } = await deployWithProductFixture();
      
      // 暂停合约
      await insurance.write.pause({
        account: deployer.account,
      });

      // 批准保费
      await token.write.approve([insurance.address, TEST_AMOUNTS.PREMIUM], {
        account: user1.account,
      });

      // 尝试购买保单
      await assert.rejects(
        async () => {
          await insurance.write.buyPolicy([productId], {
            account: user1.account,
          });
        },
        /EnforcedPause/
      );
    });
  });

  describe("DEFAULT_ADMIN_ROLE", () => {
    it("可以设置验证器地址", async () => {
      const { viem, insurance, deployer, publicClient } = await deployWithRolesFixture();
      
      // 部署新的验证器
      const newVerifier = await viem.deployContract("Groth16Verifier");

      // 更新验证器地址
      const hash = await insurance.write.setVerifier([newVerifier.address], {
        account: deployer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const verifierAddress = await insurance.read.verifier();
      assert.equal(verifierAddress.toLowerCase(), newVerifier.address.toLowerCase());
    });

    it("可以授予角色", async () => {
      const { insurance, deployer, user2, publicClient } = await deployWithRolesFixture();
      
      const INSURER_ROLE = await insurance.read.INSURER_ROLE();

      // 授予角色
      const hash = await insurance.write.grantRole([INSURER_ROLE, user2.account.address], {
        account: deployer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const hasRole = await insurance.read.hasRole([INSURER_ROLE, user2.account.address]);
      assert.equal(hasRole, true);
    });

    it("可以撤销角色", async () => {
      const { insurance, deployer, insurer, publicClient } = await deployWithRolesFixture();
      
      const INSURER_ROLE = await insurance.read.INSURER_ROLE();

      // 撤销角色
      const hash = await insurance.write.revokeRole([INSURER_ROLE, insurer.account.address], {
        account: deployer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const hasRole = await insurance.read.hasRole([INSURER_ROLE, insurer.account.address]);
      assert.equal(hasRole, false);
    });
  });

  describe("未授权操作", () => {
    it("普通用户不能创建产品", async () => {
      const { insurance, token, user1 } = await deployWithRolesFixture();
      
      const coveredRoot = bigIntToBytes32(12345n);
      
      await assert.rejects(
        async () => {
          await insurance.write.createProduct(
            [
              token.address,
              TEST_AMOUNTS.PREMIUM,
              TEST_AMOUNTS.MAX_COVERAGE,
              TEST_DURATIONS.COVERAGE_PERIOD_DAYS,
              coveredRoot,
              "ipfs://test",
            ],
            { account: user1.account }
          );
        },
        /AccessControl/
      );
    });

    it("普通用户不能暂停合约", async () => {
      const { insurance, user1 } = await deployWithRolesFixture();
      
      await assert.rejects(
        async () => {
          await insurance.write.pause({
            account: user1.account,
          });
        },
        /AccessControl/
      );
    });

    it("普通用户不能设置验证器", async () => {
      const { viem, insurance, user1 } = await deployWithRolesFixture();
      
      const newVerifier = await viem.deployContract("Groth16Verifier");
      
      await assert.rejects(
        async () => {
          await insurance.write.setVerifier([newVerifier.address], {
            account: user1.account,
          });
        },
        /AccessControl/
      );
    });
  });
});
