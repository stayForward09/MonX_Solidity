// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract MonoswapToken is ERC1155("{1}"), Ownable {
    using SafeMath for uint256;

    function mint (address account, uint256 id, uint256 amount) public onlyOwner {
      _mint(account, id, amount, "");
    }

    function burn (address account, uint256 id, uint256 amount) public onlyOwner {
      _burn(account, id, amount);
    }
}