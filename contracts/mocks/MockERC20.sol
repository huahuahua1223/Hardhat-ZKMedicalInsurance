// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @notice 用于本地开发和测试网联调的 ERC20 模拟代币。
 * @dev 该合约开放铸造和销毁接口，仅适用于测试环境，不应直接用于生产环境。
 */
contract MockERC20 is ERC20 {
    uint8 private _decimals;

    /**
     * @notice 初始化模拟代币的名称、符号和精度。
     * @param name_ 代币名称。
     * @param symbol_ 代币符号。
     * @param decimals_ 代币精度。
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    /**
     * @notice 返回代币精度。
     * @return 当前代币使用的小数位数。
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice 向指定地址铸造代币。
     * @dev 该函数不做权限控制，仅用于测试时快速准备余额。
     * @param to 接收代币的地址。
     * @param amount 铸造数量。
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @notice 从指定地址销毁代币。
     * @dev 该函数不做权限控制，仅用于测试时回收余额。
     * @param from 被销毁代币的地址。
     * @param amount 销毁数量。
     */
    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}
