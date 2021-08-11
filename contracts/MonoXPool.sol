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

    address public WETH;
    mapping (uint256 => uint256) public totalSupply;
    mapping (uint256 => uint256) public createdAt;
    mapping (uint256 => bool) public isOfficial;
    mapping (uint256 => address) public topHolder;
    mapping(uint256 => mapping(address => uint256)) liquidityLastAdded;

    constructor (address _WETH) {
      WETH = _WETH;
    }

    receive() external payable {
    }

    function mintLp(address account, uint256 id, uint256 amount, bool _isOfficial) public onlyOwner {
      if (createdAt[id] == 0) 
        createdAt[id] = block.timestamp;

      isOfficial[id] = _isOfficial;
      liquidityLastAdded[id][account] = block.timestamp;

      mint(account, id, amount);
      
      if (!_isOfficial || createdAt[id] + 90 days > block.timestamp) {
        uint256 liquidityAmount = balanceOf(account, id);
        uint256 topHolderAmount = topHolder[id] != address(0) ? balanceOf(topHolder[id], id) : 0;
        if (liquidityAmount > topHolderAmount) {
          topHolder[id] = account;
        }
      }
    }     

    function mint (address account, uint256 id, uint256 amount) public onlyOwner {
      totalSupply[id] = totalSupply[id].add(amount);
      _mint(account, id, amount, "");
    }                                

    // It doesn't track largest LP holder here because largest LP holder can not transfer tokens within 3 months.
    function burn (address account, uint256 id, uint256 amount) public onlyOwner {
      totalSupply[id] = totalSupply[id].sub(amount);
      _burn(account, id, amount);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    )
        public
        virtual
        override
    {
      require(!(isOfficial[id] == false && from == topHolder[id] && createdAt[id] + 90 days > block.timestamp), "MonoXPool:TOP HOLDER");
      super.safeTransferFrom(from, to, id, amount, data);
    }

    function totalSupplyOf(uint256 pid) external view returns (uint256) {
      return totalSupply[pid];
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

    function liquidityLastAddedOf(uint256 pid, address account) external view returns (uint256) {
      return liquidityLastAdded[pid][account];
    }

    function topLPHolderOf(uint256 pid) external view returns (address) {
      return topHolder[pid];
    }
}