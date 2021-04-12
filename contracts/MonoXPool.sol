// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract MonoXPool is ERC1155("{1}"), Ownable {
    using SafeMath for uint256;
    mapping (uint256 => uint256) public totalSupply;

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
}