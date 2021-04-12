// SPDX-License-Identifier: MIT

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
    mapping (uint256 => uint256) public totalSupply;
    address public WETH;

    constructor (address _WETH) {
      WETH = _WETH;
    }

    receive() external payable {
    }

    function mint (address account, uint256 id, uint256 amount) public onlyOwner {
      totalSupply[id]=totalSupply[id].add(amount);
      _mint(account, id, amount, "");
    }

    function burn (address account, uint256 id, uint256 amount) public onlyOwner {
      totalSupply[id]=totalSupply[id].sub(amount);
      _burn(account, id, amount);
    }

    function totalSupplyOf(uint256 pid) external view returns (uint256) {
      return totalSupply[pid];
    }

    function depositWETH(uint256 amount) external {
      IWETH(WETH).deposit{value: amount}();
    }

    function withdrawWETH(uint256 amount) external {
      IWETH(WETH).withdraw(amount);
    }

    function safeTransferETH(address to, uint amount) external {
      TransferHelper.safeTransferETH(to, amount);
    }

    function safeTransferERC20Token(address token, address to, uint256 amount) external {
      IERC20(token).safeTransfer(to, amount);
    }

    function getWETHAddr() external view returns (address) {
      return address(WETH);
    }
}