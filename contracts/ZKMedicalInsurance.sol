// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IGroth16Verifier.sol";

contract ZKMedicalInsurance is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    // BN254 scalar field (snarkjs / groth16 public inputs must be < this)
    uint256 internal constant SNARK_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // ---------------- Roles (OZ AccessControl) ----------------
    bytes32 public constant INSURER_ROLE  = keccak256("INSURER_ROLE");
    bytes32 public constant HOSPITAL_ROLE = keccak256("HOSPITAL_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");

    // ---------------- Enums ----------------
    enum PolicyStatus { Active, Cancelled, Expired }
    enum ClaimStatus  { Submitted, Verified, Approved, Rejected, Paid }

    // ---------------- Structs ----------------
    struct Product {
        uint256 id;
        address insurer;
        address token;            // premium/payout token (MVP)
        uint256 premiumAmount;
        uint256 maxCoverage;
        uint32  coveragePeriodDays;
        bytes32 coveredRoot;      // Poseidon-merkle root (as bytes32 of uint256 < SNARK_FIELD)
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
        bytes32 dataHash;          // raw bytes32 hash of documents (audit)
        bytes32 nullifier;         // one-time
        bytes32 publicSignalsHash; // keccak256(abi.encode(input[5]))
        ClaimStatus status;
        uint64 submittedAt;
        uint64 decidedAt;
        uint64 paidAt;
        bytes32 decisionMemoHash;
    }

    // ---------------- Brief views ----------------
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

    // ---------------- Errors ----------------
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

    // ---------------- Events ----------------
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    event ProductCreated(uint256 indexed productId, address indexed insurer, address indexed token);
    event ProductUpdated(uint256 indexed productId);
    event PolicyPurchased(uint256 indexed policyId, uint256 indexed productId, address indexed holder);

    event ClaimSubmitted(uint256 indexed claimId, uint256 indexed policyId, address indexed claimant);
    event ClaimVerified(uint256 indexed claimId, bytes32 publicSignalsHash);
    event ClaimApproved(uint256 indexed claimId);
    event ClaimRejected(uint256 indexed claimId, bytes32 decisionMemoHash);
    event ClaimPaid(uint256 indexed claimId, address indexed to, uint256 amount);

    // ---------------- ZK verifier ----------------
    IGroth16Verifier public verifier;

    // ---------------- Storage ----------------
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
    mapping(uint256 => uint256) public productPool; // token smallest unit

    // ---------------- Constructor ----------------
    constructor(address verifier_) {
        if (verifier_ == address(0)) revert ZeroAddress();
        verifier = IGroth16Verifier(verifier_);
        emit VerifierUpdated(address(0), verifier_);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(INSURER_ROLE, msg.sender);
        _grantRole(HOSPITAL_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    // ---------------- Admin ----------------
    function setVerifier(address verifier_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (verifier_ == address(0)) revert ZeroAddress();
        address old = address(verifier);
        verifier = IGroth16Verifier(verifier_);
        emit VerifierUpdated(old, verifier_);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ---------------- Product (Insurer) ----------------
    function createProduct(
        address token,
        uint256 premiumAmount,
        uint256 maxCoverage,
        uint32 coveragePeriodDays,
        bytes32 coveredRoot,
        string calldata uri
    ) external whenNotPaused onlyRole(INSURER_ROLE) returns (uint256 productId) {
        if (token == address(0)) revert ZeroAddress();

        // coveredRoot should be uint256(root) < SNARK_FIELD (poseidon root)
        // (we won't hard-require here to keep MVP flexible, but建议你在前端校验)

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

    function setProductActive(uint256 productId, bool active) external whenNotPaused onlyRole(INSURER_ROLE) {
        Product storage p = _product(productId);
        _requireProductInsurer(p);
        p.active = active;
        emit ProductUpdated(productId);
    }

    function updateCoveredRoot(uint256 productId, bytes32 newRoot) external whenNotPaused onlyRole(INSURER_ROLE) {
        Product storage p = _product(productId);
        _requireProductInsurer(p);
        p.coveredRoot = newRoot;
        emit ProductUpdated(productId);
    }

    function fundPool(uint256 productId, uint256 amount) external whenNotPaused onlyRole(INSURER_ROLE) {
        Product storage p = _product(productId);
        _requireProductInsurer(p);

        IERC20(p.token).safeTransferFrom(msg.sender, address(this), amount);
        productPool[productId] += amount;

        emit ProductUpdated(productId);
    }

    /**
     * @notice 创建产品并初始注资（合并操作，减少交易次数）
     * @param token 保费代币地址
     * @param premiumAmount 保费金额
     * @param maxCoverage 最大赔付额度
     * @param coveragePeriodDays 保障期限（天数）
     * @param coveredRoot 覆盖疾病的 Merkle 根
     * @param uri 产品元数据 URI
     * @param initialFunding 初始注资金额（如果为 0 则不注资）
     * @return productId 新创建的产品 ID
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

        // 如果有初始注资，立即执行
        if (initialFunding > 0) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), initialFunding);
            productPool[productId] += initialFunding;
            emit ProductUpdated(productId);
        }
    }

    // ---------------- Policy (User) ----------------
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

    // ---------------- Claim (ZK flow) ----------------
    /**
     * Public inputs (exactly 5):
     * input[0] = policyId
     * input[1] = amount
     * input[2] = dataHashField = uint256(dataHash) % SNARK_FIELD
     * input[3] = uint256(product.coveredRoot)
     * input[4] = uint256(nullifier)
     *
     * Circuit additionally enforces:
     * - diseaseId is in merkle root (coveredRoot)
     * - nullifier == Poseidon(secret, policyId, amount, dataHashField)
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

        // public input consistency checks
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

    // ---------------- View: counts ----------------
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
     * @notice 获取单个产品详情（带存在性检查）
     * @param productId 产品 ID
     * @return 产品详情
     */
    function getProduct(uint256 productId) external view returns (Product memory) {
        Product storage p = _product(productId);
        return p;
    }

    // ---------------- View: paging (global) ----------------
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

    // ---------------- View: paging (per user) ----------------
    function getUserPolicyIdsPage(address user, uint256 cursor, uint256 size)
        external
        view
        returns (uint256[] memory ids, uint256 nextCursor)
    {
        return _pageUserSet(_userPolicyIds[user], cursor, size);
    }

    function getUserClaimIdsPage(address user, uint256 cursor, uint256 size)
        external
        view
        returns (uint256[] memory ids, uint256 nextCursor)
    {
        return _pageUserSet(_userClaimIds[user], cursor, size);
    }

    // ---------------- Internal helpers ----------------
    function _requireProductInsurer(Product storage p) internal view {
        if (p.insurer == address(0)) revert ProductNotFound();
        if (msg.sender == p.insurer) return;
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) return;
        revert NotProductInsurer();
    }

    function _product(uint256 productId) internal view returns (Product storage p) {
        p = products[productId];
        if (p.insurer == address(0)) revert ProductNotFound();
    }

    function _policy(uint256 policyId) internal view returns (Policy storage p) {
        p = policies[policyId];
        if (p.holder == address(0)) revert PolicyNotFound();
    }

    function _claim(uint256 claimId) internal view returns (Claim storage c) {
        c = claims[claimId];
        if (c.claimant == address(0)) revert ClaimNotFound();
    }

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