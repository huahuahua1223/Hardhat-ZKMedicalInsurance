import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deployZKInsuranceFixture } from "./helpers/fixtures.js";
import { loadZKProofData } from "./helpers/zkProofLoader.js";

describe("Groth16Verifier", () => {
  describe("证明验证", () => {
    it("使用真实证明数据验证通过", async () => {
      const { verifier } = await deployZKInsuranceFixture();
      
      // 加载真实 ZK 证明数据
      const zkProof = loadZKProofData();

      // 验证证明
      const result = await verifier.read.verifyProof([
        zkProof.pA,
        zkProof.pB,
        zkProof.pC,
        zkProof.publicSignals,
      ]);

      assert.equal(result, true);
    });

    it("错误的证明被拒绝 - 错误的 pA", async () => {
      const { verifier } = await deployZKInsuranceFixture();
      
      const zkProof = loadZKProofData();

      // 修改 pA 使其无效
      const invalidPA: [bigint, bigint] = [zkProof.pA[0] + 1n, zkProof.pA[1]];

      const result = await verifier.read.verifyProof([
        invalidPA,
        zkProof.pB,
        zkProof.pC,
        zkProof.publicSignals,
      ]);

      assert.equal(result, false);
    });

    it("错误的证明被拒绝 - 错误的 pB", async () => {
      const { verifier } = await deployZKInsuranceFixture();
      
      const zkProof = loadZKProofData();

      // 修改 pB 使其无效
      const invalidPB: [[bigint, bigint], [bigint, bigint]] = [
        [zkProof.pB[0][0] + 1n, zkProof.pB[0][1]],
        zkProof.pB[1],
      ];

      const result = await verifier.read.verifyProof([
        zkProof.pA,
        invalidPB,
        zkProof.pC,
        zkProof.publicSignals,
      ]);

      assert.equal(result, false);
    });

    it("错误的证明被拒绝 - 错误的 pC", async () => {
      const { verifier } = await deployZKInsuranceFixture();
      
      const zkProof = loadZKProofData();

      // 修改 pC 使其无效
      const invalidPC: [bigint, bigint] = [zkProof.pC[0], zkProof.pC[1] + 1n];

      const result = await verifier.read.verifyProof([
        zkProof.pA,
        zkProof.pB,
        invalidPC,
        zkProof.publicSignals,
      ]);

      assert.equal(result, false);
    });

    it("错误的公开输入被拒绝", async () => {
      const { verifier } = await deployZKInsuranceFixture();
      
      const zkProof = loadZKProofData();

      // 修改公开输入使其无效
      const invalidPublicSignals: [bigint, bigint, bigint, bigint, bigint] = [
        zkProof.publicSignals[0] + 1n, // 改变 policyId
        zkProof.publicSignals[1],
        zkProof.publicSignals[2],
        zkProof.publicSignals[3],
        zkProof.publicSignals[4],
      ];

      const result = await verifier.read.verifyProof([
        zkProof.pA,
        zkProof.pB,
        zkProof.pC,
        invalidPublicSignals,
      ]);

      assert.equal(result, false);
    });

    it("完全错误的数据被拒绝", async () => {
      const { verifier } = await deployZKInsuranceFixture();
      
      // 使用随机数据
      const randomProof = {
        pA: [12345n, 67890n] as [bigint, bigint],
        pB: [
          [11111n, 22222n],
          [33333n, 44444n],
        ] as [[bigint, bigint], [bigint, bigint]],
        pC: [55555n, 66666n] as [bigint, bigint],
        publicSignals: [1n, 2n, 3n, 4n, 5n] as [bigint, bigint, bigint, bigint, bigint],
      };

      const result = await verifier.read.verifyProof([
        randomProof.pA,
        randomProof.pB,
        randomProof.pC,
        randomProof.publicSignals,
      ]);

      assert.equal(result, false);
    });

    it("gas 消耗在合理范围", async () => {
      const { verifier, publicClient, deployer } = await deployZKInsuranceFixture();
      
      const zkProof = loadZKProofData();

      // 估算 gas
      const gasEstimate = await publicClient.estimateContractGas({
        address: verifier.address,
        abi: verifier.abi,
        functionName: "verifyProof",
        args: [zkProof.pA, zkProof.pB, zkProof.pC, zkProof.publicSignals],
        account: deployer.account.address,
      });

      // Groth16 验证通常消耗约 200k-300k gas
      console.log(`Groth16 验证 gas 消耗: ${gasEstimate}`);
      assert.equal(gasEstimate < 500000n, true, "Gas 消耗应该小于 500k");
    });

    it("验证器地址可以被合约读取", async () => {
      const { verifier, insurance } = await deployZKInsuranceFixture();
      
      const verifierAddress = await insurance.read.verifier();
      assert.equal(verifierAddress.toLowerCase(), verifier.address.toLowerCase());
    });
  });

  describe("证明参数边界测试", () => {
    it("零值输入被正确处理", async () => {
      const { verifier } = await deployZKInsuranceFixture();
      
      const zeroProof = {
        pA: [0n, 0n] as [bigint, bigint],
        pB: [
          [0n, 0n],
          [0n, 0n],
        ] as [[bigint, bigint], [bigint, bigint]],
        pC: [0n, 0n] as [bigint, bigint],
        publicSignals: [0n, 0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint, bigint],
      };

      const result = await verifier.read.verifyProof([
        zeroProof.pA,
        zeroProof.pB,
        zeroProof.pC,
        zeroProof.publicSignals,
      ]);

      // 零值不是有效的证明，应该返回 false
      assert.equal(result, false);
    });

    it("可以使用相同证明验证多次", async () => {
      const { verifier } = await deployZKInsuranceFixture();
      
      const zkProof = loadZKProofData();

      // 第一次验证
      const result1 = await verifier.read.verifyProof([
        zkProof.pA,
        zkProof.pB,
        zkProof.pC,
        zkProof.publicSignals,
      ]);

      // 第二次验证
      const result2 = await verifier.read.verifyProof([
        zkProof.pA,
        zkProof.pB,
        zkProof.pC,
        zkProof.publicSignals,
      ]);

      // 两次验证都应该通过
      assert.equal(result1, true);
      assert.equal(result2, true);
    });
  });
});
