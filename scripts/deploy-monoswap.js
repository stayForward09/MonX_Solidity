const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const Web3 = require('web3');
const { utils } = Web3;
async function main() {

  const [deployer] = await ethers.getSigners();

  console.log(
    "Deploying contracts with the account:",
    deployer.address
  );
  
  console.log("Account balance:", (await deployer.getBalance()).toString());
  const MonoXPool = await ethers.getContractFactory("MonoXPool");
  const Monoswap = await ethers.getContractFactory("Monoswap");
  const WETH9 = await ethers.getContractFactory("WETH9");
  const VUSD = await ethers.getContractFactory('VUSD');
  const weth = await WETH9.deploy();
  console.log("WETH address:", weth.address);
  const vusd = await VUSD.deploy();
  console.log("VUSD address:", vusd.address);
  await vusd.deployed();
  const monoXPool = await MonoXPool.deploy(weth.address);
  console.log("MonoXPool address:", monoXPool.address);
  const monoswap = await upgrades.deployProxy(Monoswap, [monoXPool.address, vusd.address])
  console.log("Monoswap address:", monoswap.address);
  await weth.deployed();
  await vusd.deployed();
  await monoXPool.deployed();
  await monoswap.deployed();
  
  await vusd.transferOwnership(monoswap.address);
  await monoXPool.transferOwnership(monoswap.address);
  const devAddr = deployer.address;
  await monoswap.setFeeTo(devAddr);
  
  await hre.run("verify:verify", {
    address: vusd.address,
    constructorArguments: [
    ],
  })

  await hre.run("verify:verify", {
    address: weth.address,
    constructorArguments: [
    ],
  })

  await hre.run("verify:verify", {
    address: monoXPool.address,
    constructorArguments: [
      weth.address
    ],
  })

  const oz_monoswap = require("../.openzeppelin/ropsten.json")
  // const oz_monoswap = require("../.openzeppelin/mainnet.json")
  const monoswapImplAddress = oz_monoswap.impls[Object.keys(oz_monoswap.impls)[0]].address
  console.log('Monoswap Impl Address', monoswapImplAddress)
  await hre.run("verify:verify", {
    address: monoswapImplAddress,
    constructorArguments: [
    ],
  })

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });