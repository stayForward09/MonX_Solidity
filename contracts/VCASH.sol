// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VCASH is ERC20("Virtual Cash", "vCASH"), Ownable {
	function mint (address account, uint256 amount) onlyOwner external {
		_mint(account, amount);
	}

	function burn (address account, uint256 amount) onlyOwner external {
		_burn(account, amount);
	}
	
	
}