const hre = require("hardhat")
const { ethers, upgrades } = require("hardhat")
const Web3 = require('web3');
const { utils } = Web3;

async function main() {

  const [deployer] = await ethers.getSigners();

  console.log(
    "Deploying contracts with the account:",
    deployer.address
  );
  
  console.log("Account balance:", (await deployer.getBalance()).toString());
  
  const MonoXPool = await ethers.getContractFactory("MonoXPool")
  const monoXPool = await MonoXPool.attach(process.env.MONOXPOOL_ADDRESS);
  await monoXPool.setWhitelist(process.env.MONOSWAP_STAKING_ADDRESS, true)
  await monoXPool.setWhitelist(deployer.address, true) // deployer.address is owner
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });