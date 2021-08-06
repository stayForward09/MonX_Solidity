// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';
import './interfaces/IWETH.sol';

contract MonoXPool is ERC1155("{1}"), Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    
    struct LiquidityInfo {
      uint256 totalSupply;
      mapping(address => uint256) lastAddedBlock;
      address topHolder;
    }
    mapping (uint256 => LiquidityInfo) liquidityInfo;

    address public WETH;

    constructor (address _WETH) {
      WETH = _WETH;
    }

    receive() external payable {
    }

    function mint (address account, uint256 id, uint256 amount) public onlyOwner {
      LiquidityInfo storage liquidity = liquidityInfo[id];
      liquidity.totalSupply = liquidity.totalSupply.add(amount);
      liquidity.lastAddedBlock[account] = block.number;
      _mint(account, id, amount, "");
      uint256 liquidityAmount = balanceOf(account, id);
      uint256 topHolderAmount = liquidity.topHolder != address(0) ? balanceOf(liquidity.topHolder, id) : 0;
      if (liquidityAmount > topHolderAmount) {
        liquidity.topHolder = account;
      }
    }

    function burn (address account, uint256 id, uint256 amount) public onlyOwner {
      LiquidityInfo storage liquidity = liquidityInfo[id];
      liquidity.totalSupply = liquidity.totalSupply.sub(amount);
      _burn(account, id, amount);
    }

    function totalSupplyOf(uint256 pid) external view returns (uint256) {
      return liquidityInfo[pid].totalSupply;
    }

    function depositWETH(uint256 amount) external {
      IWETH(WETH).deposit{value: amount}();
    }

    function withdrawWETH(uint256 amount) external onlyOwner{
      IWETH(WETH).withdraw(amount);
    }

    function safeTransferETH(address to, uint amount) external onlyOwner {
      TransferHelper.safeTransferETH(to, amount);
    }

    function safeTransferERC20Token(address token, address to, uint256 amount) external onlyOwner{
      IERC20(token).safeTransfer(to, amount);
    }

    function getWETHAddr() external view returns (address) {
      return address(WETH);
    }

    function liquidityLastAddedBlock(uint256 pid, address account) external view returns (uint256) {
      return liquidityInfo[pid].lastAddedBlock[account];
    }

    function topLPHolder(uint256 pid) external view returns (address) {
      return liquidityInfo[pid].topHolder;
    }
}