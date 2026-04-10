// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IGroth16Verifier.sol";

/**
 * @title ZKMedicalInsurance
 * @notice 基于零知识证明的医疗保险业务合约。
 * @dev
 * 合约角色说明：
 * - 管理员可以更新 verifier，并拥有兜底管理权限。
 * - insurer 负责创建产品、调整产品状态、更新保障疾病根、注资、审核和赔付。
 * - hospital 可以代表投保人提交理赔证明。
 *
 * 业务流程说明：
 * - 产品创建时写入保费、赔付上限、保障期限和 coveredRoot。
 * - 用户购买保单后，保费会进入对应产品资金池。
 * - 提交理赔时，链上只校验公开输入与当前保单/产品状态一致，并调用 Groth16 verifier 验证证明。
 * - nullifier 用于防止同一份私密材料被重复理赔。
 */
contract ZKMedicalInsurance is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    // BN254 标量域大小，snarkjs / Groth16 的公开输入必须严格小于该值。
    uint256 internal constant SNARK_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // ---------------- 角色定义 ----------------
    bytes32 public constant INSURER_ROLE  = keccak256("INSURER_ROLE");
    bytes32 public constant HOSPITAL_ROLE = keccak256("HOSPITAL_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");

    // ---------------- 枚举定义 ----------------
    enum PolicyStatus { Active, Cancelled, Expired }
    enum ClaimStatus  { Submitted, Verified, Approved, Rejected, Paid }

    // ---------------- 核心数据结构 ----------------
    struct Product {
        uint256 id;
        address insurer;
        address token;            // 用于支付保费和赔付的 ERC20 代币
        uint256 premiumAmount;
        uint256 maxCoverage;
        uint32  coveragePeriodDays;
        bytes32 coveredRoot;      // 保障疾病集合对应的 Poseidon Merkle 根
        bool    active;
        uint64  createdAt;
        string  uri;
    }

    struct Policy {
        uint256 id;
        uint256 productId;
        address holder;
        uint64  startAt;
        uint64  endAt;
        PolicyStatus status;
        uint64  createdAt;
    }

    struct Claim {
        uint256 id;
        uint256 policyId;
        address claimant;
        uint256 amount;
        bytes32 dataHash;          // 理赔材料的原始 bytes32 哈希，便于审计留痕
        bytes32 nullifier;         // 一次性标识符，用于防止重复理赔
        bytes32 publicSignalsHash; // keccak256(abi.encode(input))
        ClaimStatus status;
        uint64 submittedAt;
        uint64 decidedAt;
        uint64 paidAt;
        bytes32 decisionMemoHash;
    }

    // ---------------- 简版视图结构 ----------------
    struct ProductBrief {
        uint256 id;
        address insurer;
        address token;
        uint256 premiumAmount;
        uint256 maxCoverage;
        uint32  coveragePeriodDays;
        bytes32 coveredRoot;
        bool    active;
    }

    struct PolicyBrief {
        uint256 id;
        uint256 productId;
        address holder;
        uint64  startAt;
        uint64  endAt;
        PolicyStatus status;
    }

    struct ClaimBrief {
        uint256 id;
        uint256 policyId;
        address claimant;
        uint256 amount;
        bytes32 dataHash;
        bytes32 nullifier;
        ClaimStatus status;
        uint64 submittedAt;
    }

    // ---------------- 自定义错误 ----------------
    error ZeroAddress();
    error ProductNotFound();
    error PolicyNotFound();
    error ClaimNotFound();

    error NotProductInsurer();
    error ProductNotActive();
    error PolicyNotActive();
    error PolicyExpired();
    error Unauthorized();

    error AmountExceedsCoverage();
    error InvalidProof();
    error InvalidPublicSignals();
    error NullifierAlreadyUsed();
    error ClaimNotInExpectedStatus();
    error PoolInsufficient();

    // ---------------- 事件定义 ----------------
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    event ProductCreated(uint256 indexed productId, address indexed insurer, address indexed token);
    event ProductUpdated(uint256 indexed productId);
    event PolicyPurchased(uint256 indexed policyId, uint256 indexed productId, address indexed holder);

    event ClaimSubmitted(uint256 indexed claimId, uint256 indexed policyId, address indexed claimant);
    event ClaimVerified(uint256 indexed claimId, bytes32 publicSignalsHash);
    event ClaimApproved(uint256 indexed claimId);
    event ClaimRejected(uint256 indexed claimId, bytes32 decisionMemoHash);
    event ClaimPaid(uint256 indexed claimId, address indexed to, uint256 amount);

    // ---------------- ZK 验证器 ----------------
    IGroth16Verifier public verifier;

    // ---------------- 存储区 ----------------
    uint256 private _productSeq;
    uint256 private _policySeq;
    uint256 private _claimSeq;

    mapping(uint256 => Product) public products;
    mapping(uint256 => Policy)  public policies;
    mapping(uint256 => Claim)   public claims;

    uint256[] private _productIds;
    uint256[] private _policyIds;
    uint256[] private _claimIds;

    mapping(address => EnumerableSet.UintSet) private _userPolicyIds;
    mapping(address => EnumerableSet.UintSet) private _userClaimIds;

    mapping(bytes32 => bool) public usedNullifier;
    mapping(uint256 => uint256) public productPool; // 按代币最小单位记录每个产品的资金池余额

    // ---------------- 构造函数 ----------------
    constructor(address verifier_) {
        if (verifier_ == address(0)) revert ZeroAddress();
        verifier = IGroth16Verifier(verifier_);
        emit VerifierUpdated(address(0), verifier_);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(INSURER_ROLE, msg.sender);
        _grantRole(HOSPITAL_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    // ---------------- 管理接口 ----------------
    /**
     * @notice 更新当前使用的 Groth16 验证器地址。
     * @param verifier_ 新 verifier 合约地址。
     */
    function setVerifier(address verifier_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (verifier_ == address(0)) revert ZeroAddress();
        address old = address(verifier);
        verifier = IGroth16Verifier(verifier_);
        emit VerifierUpdated(old, verifier_);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ---------------- 产品接口（保险公司） ----------------
    /**
     * @notice 创建一个新的保险产品。
     * @dev coveredRoot 建议在前端或离线脚本中保证对应的 uint256 值小于 SNARK_FIELD。
     * @param token 保费和赔付所使用的 ERC20 代币地址。
     * @param premiumAmount 单次购买该产品所需支付的保费。
     * @param maxCoverage 单笔理赔允许的最高赔付金额。
     * @param coveragePeriodDays 保单有效期，单位为天。
     * @param coveredRoot 保障疾病集合对应的 Poseidon Merkle 根。
     * @param uri 产品元数据地址。
     * @return productId 新创建的产品 ID。
     */
    function createProduct(
        address token,
        uint256 premiumAmount,
        uint256 maxCoverage,
        uint32 coveragePeriodDays,
        bytes32 coveredRoot,
        string calldata uri
    ) external whenNotPaused onlyRole(INSURER_ROLE) returns (uint256 productId) {
        if (token == address(0)) revert ZeroAddress();

        // coveredRoot 对应的数值应当落在 SNARK_FIELD 内，当前版本为兼容性考虑不在链上强制限制。
        productId = ++_productSeq;

        products[productId] = Product({
            id: productId,
            insurer: msg.sender,
            token: token,
            premiumAmount: premiumAmount,
            maxCoverage: maxCoverage,
            coveragePeriodDays: coveragePeriodDays,
            coveredRoot: coveredRoot,
            active: true,
            createdAt: uint64(block.timestamp),
            uri: uri
        });

        _productIds.push(productId);
        emit ProductCreated(productId, msg.sender, token);
    }

    /**
     * @notice 调整产品是否上架。
     * @param productId 目标产品 ID。
     * @param active 是否启用该产品。
     */
    function setProductActive(uint256 productId, bool active) external whenNotPaused onlyRole(INSURER_ROLE) {
        Product storage p = _product(productId);
        _requireProductInsurer(p);
        p.active = active;
        emit ProductUpdated(productId);
    }

    /**
     * @notice 更新产品对应的保障疾病根。
     * @dev 已购买保单若要继续提交有效证明，前端 metadata 中的疾病集合也必须同步更新。
     * @param productId 目标产品 ID。
     * @param newRoot 新的保障疾病 Merkle 根。
     */
    function updateCoveredRoot(uint256 productId, bytes32 newRoot) external whenNotPaused onlyRole(INSURER_ROLE) {
        Product storage p = _product(productId);
        _requireProductInsurer(p);
        p.coveredRoot = newRoot;
        emit ProductUpdated(productId);
    }

    /**
     * @notice 向指定产品资金池注资。
     * @param productId 产品 ID。
     * @param amount 注资金额。
     */
    function fundPool(uint256 productId, uint256 amount) external whenNotPaused onlyRole(INSURER_ROLE) {
        Product storage p = _product(productId);
        _requireProductInsurer(p);

        IERC20(p.token).safeTransferFrom(msg.sender, address(this), amount);
        productPool[productId] += amount;

        emit ProductUpdated(productId);
    }

    /**
     * @notice 创建产品并可选地一次性完成初始注资。
     * @param token 保费和赔付所使用的 ERC20 代币地址。
     * @param premiumAmount 单次购买该产品所需支付的保费。
     * @param maxCoverage 单笔理赔允许的最高赔付金额。
     * @param coveragePeriodDays 保单有效期，单位为天。
     * @param coveredRoot 保障疾病集合对应的 Poseidon Merkle 根。
     * @param uri 产品元数据地址。
     * @param initialFunding 初始注资金额；为 0 时仅创建产品不注资。
     * @return productId 新创建的产品 ID。
     */
    function createProductWithFunding(
        address token,
        uint256 premiumAmount,
        uint256 maxCoverage,
        uint32 coveragePeriodDays,
        bytes32 coveredRoot,
        string calldata uri,
        uint256 initialFunding
    ) external whenNotPaused onlyRole(INSURER_ROLE) returns (uint256 productId) {
        if (token == address(0)) revert ZeroAddress();

        productId = ++_productSeq;

        products[productId] = Product({
            id: productId,
            insurer: msg.sender,
            token: token,
            premiumAmount: premiumAmount,
            maxCoverage: maxCoverage,
            coveragePeriodDays: coveragePeriodDays,
            coveredRoot: coveredRoot,
            active: true,
            createdAt: uint64(block.timestamp),
            uri: uri
        });

        _productIds.push(productId);
        emit ProductCreated(productId, msg.sender, token);

        // 如果指定了初始资金，则在同一笔交易中完成注资。
        if (initialFunding > 0) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), initialFunding);
            productPool[productId] += initialFunding;
            emit ProductUpdated(productId);
        }
    }

    // ---------------- 保单接口（用户） ----------------
    /**
     * @notice 购买指定产品并生成保单。
     * @param productId 目标产品 ID。
     * @return policyId 新创建的保单 ID。
     */
    function buyPolicy(uint256 productId) external whenNotPaused nonReentrant returns (uint256 policyId) {
        Product storage p = _product(productId);
        if (!p.active) revert ProductNotActive();

        IERC20(p.token).safeTransferFrom(msg.sender, address(this), p.premiumAmount);
        productPool[productId] += p.premiumAmount;

        policyId = ++_policySeq;

        uint64 startAt = uint64(block.timestamp);
        uint64 endAt = uint64(block.timestamp + uint256(p.coveragePeriodDays) * 1 days);

        policies[policyId] = Policy({
            id: policyId,
            productId: productId,
            holder: msg.sender,
            startAt: startAt,
            endAt: endAt,
            status: PolicyStatus.Active,
            createdAt: uint64(block.timestamp)
        });

        _policyIds.push(policyId);
        _userPolicyIds[msg.sender].add(policyId);

        emit PolicyPurchased(policyId, productId, msg.sender);
    }

    // ---------------- 理赔接口（零知识证明流程） ----------------
    /**
     * @notice 使用 Groth16 证明提交理赔。
     * @dev 公开输入固定为 5 个，顺序如下：
     * - input[0] = policyId
     * - input[1] = amount
     * - input[2] = uint256(dataHash) % SNARK_FIELD
     * - input[3] = uint256(product.coveredRoot)
     * - input[4] = uint256(nullifier)
     *
     * 电路额外约束：
     * - diseaseId 必须包含在 coveredRoot 对应的保障疾病 Merkle 树中；
     * - nullifier 必须等于 Poseidon(secret, policyId, amount, dataHashField)。
     *
     * @param policyId 理赔对应的保单 ID。
     * @param amount 本次申请的理赔金额。
     * @param dataHash 理赔材料哈希。
     * @param nullifier 一次性标识符。
     * @param a 证明中的 G1 点 A。
     * @param b 证明中的 G2 点 B。
     * @param c 证明中的 G1 点 C。
     * @param input 公开输入数组。
     * @return claimId 新创建的理赔记录 ID。
     */
    function submitClaimWithProof(
        uint256 policyId,
        uint256 amount,
        bytes32 dataHash,
        bytes32 nullifier,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[5] calldata input
    ) external whenNotPaused nonReentrant returns (uint256 claimId) {
        Policy storage pol = _policy(policyId);
        if (pol.status != PolicyStatus.Active) revert PolicyNotActive();
        if (block.timestamp > pol.endAt) revert PolicyExpired();
        if (msg.sender != pol.holder && !hasRole(HOSPITAL_ROLE, msg.sender)) revert Unauthorized();

        Product storage p = _product(pol.productId);
        if (!p.active) revert ProductNotActive();
        if (amount > p.maxCoverage) revert AmountExceedsCoverage();

        if (usedNullifier[nullifier]) revert NullifierAlreadyUsed();

        uint256 dataHashField = uint256(dataHash) % SNARK_FIELD;

        // 先校验公开输入与当前链上状态严格一致，再调用 verifier。
        if (input[0] != policyId) revert InvalidPublicSignals();
        if (input[1] != amount) revert InvalidPublicSignals();
        if (input[2] != dataHashField) revert InvalidPublicSignals();
        if (input[3] != uint256(p.coveredRoot)) revert InvalidPublicSignals();
        if (input[4] != uint256(nullifier)) revert InvalidPublicSignals();

        bool ok = verifier.verifyProof(a, b, c, input);
        if (!ok) revert InvalidProof();

        usedNullifier[nullifier] = true;

        claimId = ++_claimSeq;

        bytes32 pubHash = keccak256(abi.encode(input));

        claims[claimId] = Claim({
            id: claimId,
            policyId: policyId,
            claimant: pol.holder,
            amount: amount,
            dataHash: dataHash,
            nullifier: nullifier,
            publicSignalsHash: pubHash,
            status: ClaimStatus.Verified,
            submittedAt: uint64(block.timestamp),
            decidedAt: 0,
            paidAt: 0,
            decisionMemoHash: bytes32(0)
        });

        _claimIds.push(claimId);
        _userClaimIds[pol.holder].add(claimId);

        emit ClaimSubmitted(claimId, policyId, pol.holder);
        emit ClaimVerified(claimId, pubHash);
    }

    /**
     * @notice 保险公司批准已通过 ZK 验证的理赔。
     * @param claimId 理赔记录 ID。
     */
    function approveClaim(uint256 claimId) external whenNotPaused onlyRole(INSURER_ROLE) {
        Claim storage cl = _claim(claimId);
        if (cl.status != ClaimStatus.Verified) revert ClaimNotInExpectedStatus();

        uint256 productId = _policy(cl.policyId).productId;
        Product storage p = _product(productId);
        _requireProductInsurer(p);

        cl.status = ClaimStatus.Approved;
        cl.decidedAt = uint64(block.timestamp);
        emit ClaimApproved(claimId);
    }

    /**
     * @notice 保险公司拒绝已通过 ZK 验证的理赔。
     * @param claimId 理赔记录 ID。
     * @param decisionMemoHash 拒赔备注或附加材料的哈希。
     */
    function rejectClaim(uint256 claimId, bytes32 decisionMemoHash) external whenNotPaused onlyRole(INSURER_ROLE) {
        Claim storage cl = _claim(claimId);
        if (cl.status != ClaimStatus.Verified) revert ClaimNotInExpectedStatus();

        uint256 productId = _policy(cl.policyId).productId;
        Product storage p = _product(productId);
        _requireProductInsurer(p);

        cl.status = ClaimStatus.Rejected;
        cl.decidedAt = uint64(block.timestamp);
        cl.decisionMemoHash = decisionMemoHash;

        emit ClaimRejected(claimId, decisionMemoHash);
    }

    /**
     * @notice 从产品资金池向理赔人发放赔付款。
     * @param claimId 理赔记录 ID。
     */
    function payoutClaim(uint256 claimId) external whenNotPaused nonReentrant onlyRole(INSURER_ROLE) {
        Claim storage cl = _claim(claimId);
        if (cl.status != ClaimStatus.Approved) revert ClaimNotInExpectedStatus();

        Policy storage pol = _policy(cl.policyId);
        uint256 productId = pol.productId;
        Product storage p = _product(productId);
        _requireProductInsurer(p);

        if (productPool[productId] < cl.amount) revert PoolInsufficient();

        productPool[productId] -= cl.amount;
        IERC20(p.token).safeTransfer(cl.claimant, cl.amount);

        cl.status = ClaimStatus.Paid;
        cl.paidAt = uint64(block.timestamp);

        emit ClaimPaid(claimId, cl.claimant, cl.amount);
    }

    // ---------------- 只读接口：数量 ----------------
    function productsCount() external view returns (uint256) { return _productIds.length; }
    function policiesCount() external view returns (uint256) { return _policyIds.length; }
    function claimsCount() external view returns (uint256) { return _claimIds.length; }

    function userPoliciesCount(address user) external view returns (uint256) {
        return _userPolicyIds[user].length();
    }

    function userClaimsCount(address user) external view returns (uint256) {
        return _userClaimIds[user].length();
    }

    /**
     * @notice 获取单个产品详情，并在内部校验产品是否存在。
     * @param productId 产品 ID。
     * @return 产品完整信息。
     */
    function getProduct(uint256 productId) external view returns (Product memory) {
        Product storage p = _product(productId);
        return p;
    }

    // ---------------- 只读接口：全局分页 ----------------
    /**
     * @notice 分页查询产品简版信息。
     * @param cursor 起始游标。
     * @param size 本页数量。
     * @return items 产品简版数组。
     * @return nextCursor 下一页游标。
     */
    function getProductsBriefPage(uint256 cursor, uint256 size)
        external
        view
        returns (ProductBrief[] memory items, uint256 nextCursor)
    {
        (uint256[] memory ids, uint256 nc) = _pageIds(_productIds, cursor, size);
        items = new ProductBrief[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            Product storage p = products[ids[i]];
            items[i] = ProductBrief({
                id: p.id,
                insurer: p.insurer,
                token: p.token,
                premiumAmount: p.premiumAmount,
                maxCoverage: p.maxCoverage,
                coveragePeriodDays: p.coveragePeriodDays,
                coveredRoot: p.coveredRoot,
                active: p.active
            });
        }
        nextCursor = nc;
    }

    /**
     * @notice 分页查询保单简版信息。
     * @param cursor 起始游标。
     * @param size 本页数量。
     * @return items 保单简版数组。
     * @return nextCursor 下一页游标。
     */
    function getPoliciesBriefPage(uint256 cursor, uint256 size)
        external
        view
        returns (PolicyBrief[] memory items, uint256 nextCursor)
    {
        (uint256[] memory ids, uint256 nc) = _pageIds(_policyIds, cursor, size);
        items = new PolicyBrief[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            Policy storage p = policies[ids[i]];
            items[i] = PolicyBrief({
                id: p.id,
                productId: p.productId,
                holder: p.holder,
                startAt: p.startAt,
                endAt: p.endAt,
                status: p.status
            });
        }
        nextCursor = nc;
    }

    /**
     * @notice 分页查询理赔简版信息。
     * @param cursor 起始游标。
     * @param size 本页数量。
     * @return items 理赔简版数组。
     * @return nextCursor 下一页游标。
     */
    function getClaimsBriefPage(uint256 cursor, uint256 size)
        external
        view
        returns (ClaimBrief[] memory items, uint256 nextCursor)
    {
        (uint256[] memory ids, uint256 nc) = _pageIds(_claimIds, cursor, size);
        items = new ClaimBrief[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            Claim storage c = claims[ids[i]];
            items[i] = ClaimBrief({
                id: c.id,
                policyId: c.policyId,
                claimant: c.claimant,
                amount: c.amount,
                dataHash: c.dataHash,
                nullifier: c.nullifier,
                status: c.status,
                submittedAt: c.submittedAt
            });
        }
        nextCursor = nc;
    }

    // ---------------- 只读接口：用户维度分页 ----------------
    /**
     * @notice 分页查询某个用户持有的保单 ID。
     * @param user 目标用户地址。
     * @param cursor 起始游标。
     * @param size 本页数量。
     * @return ids 保单 ID 数组。
     * @return nextCursor 下一页游标。
     */
    function getUserPolicyIdsPage(address user, uint256 cursor, uint256 size)
        external
        view
        returns (uint256[] memory ids, uint256 nextCursor)
    {
        return _pageUserSet(_userPolicyIds[user], cursor, size);
    }

    /**
     * @notice 分页查询某个用户提交的理赔 ID。
     * @param user 目标用户地址。
     * @param cursor 起始游标。
     * @param size 本页数量。
     * @return ids 理赔 ID 数组。
     * @return nextCursor 下一页游标。
     */
    function getUserClaimIdsPage(address user, uint256 cursor, uint256 size)
        external
        view
        returns (uint256[] memory ids, uint256 nextCursor)
    {
        return _pageUserSet(_userClaimIds[user], cursor, size);
    }

    // ---------------- 内部辅助函数 ----------------
    /**
     * @notice 校验当前调用方是否有权限管理该产品。
     * @dev 产品创建者和默认管理员均可通过校验。
     * @param p 产品存储引用。
     */
    function _requireProductInsurer(Product storage p) internal view {
        if (p.insurer == address(0)) revert ProductNotFound();
        if (msg.sender == p.insurer) return;
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) return;
        revert NotProductInsurer();
    }

    /**
     * @notice 读取产品并保证其存在。
     * @param productId 产品 ID。
     * @return p 产品存储引用。
     */
    function _product(uint256 productId) internal view returns (Product storage p) {
        p = products[productId];
        if (p.insurer == address(0)) revert ProductNotFound();
    }

    /**
     * @notice 读取保单并保证其存在。
     * @param policyId 保单 ID。
     * @return p 保单存储引用。
     */
    function _policy(uint256 policyId) internal view returns (Policy storage p) {
        p = policies[policyId];
        if (p.holder == address(0)) revert PolicyNotFound();
    }

    /**
     * @notice 读取理赔记录并保证其存在。
     * @param claimId 理赔 ID。
     * @return c 理赔存储引用。
     */
    function _claim(uint256 claimId) internal view returns (Claim storage c) {
        c = claims[claimId];
        if (c.claimant == address(0)) revert ClaimNotFound();
    }

    /**
     * @notice 对数组形式的 ID 列表做通用分页。
     * @param arr 目标数组。
     * @param cursor 起始游标。
     * @param size 本页数量。
     * @return ids 当前页的 ID 数组。
     * @return nextCursor 下一页游标。
     */
    function _pageIds(uint256[] storage arr, uint256 cursor, uint256 size)
        internal
        view
        returns (uint256[] memory ids, uint256 nextCursor)
    {
        uint256 len = arr.length;
        if (cursor >= len) {
            return (new uint256[](0), cursor);
        }

        uint256 end = cursor + size;
        if (end > len) end = len;

        ids = new uint256[](end - cursor);
        for (uint256 i = cursor; i < end; i++) {
            ids[i - cursor] = arr[i];
        }
        nextCursor = end;
    }

    /**
     * @notice 对 EnumerableSet 维护的用户 ID 集合做分页。
     * @param set 目标集合。
     * @param cursor 起始游标。
     * @param size 本页数量。
     * @return ids 当前页的 ID 数组。
     * @return nextCursor 下一页游标。
     */
    function _pageUserSet(EnumerableSet.UintSet storage set, uint256 cursor, uint256 size)
        internal
        view
        returns (uint256[] memory ids, uint256 nextCursor)
    {
        uint256 len = set.length();
        if (cursor >= len) {
            return (new uint256[](0), cursor);
        }

        uint256 end = cursor + size;
        if (end > len) end = len;

        ids = new uint256[](end - cursor);
        for (uint256 i = cursor; i < end; i++) {
            ids[i - cursor] = set.at(i);
        }
        nextCursor = end;
    }
}
