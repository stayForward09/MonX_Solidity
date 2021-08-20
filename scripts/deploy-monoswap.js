const hre = require("hardhat")
const { ethers, upgrades } = require("hardhat")
async function main() {
  
  const [deployer] = await ethers.getSigners()

  console.log(
    "Deploying contracts with the account:",
    deployer.address
  )
  
  console.log("Account balance:", (await deployer.getBalance()).toString())
  const network = await ethers.provider.getNetwork()
  const MonoXPool = await ethers.getContractFactory("MonoXPool")
  const Monoswap = await ethers.getContractFactory("Monoswap")
  const VUSD = await ethers.getContractFactory('VUSD')
  let WETH
  switch (network.chainId) {
    case 1: // mainnet
      WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
      break
    case 42: // kovan
      WETH = '0xd0A1E359811322d97991E03f863a0C30C2cF029C'
      break
    case 3: // ropsten
      WETH = '0xc778417e063141139fce010982780140aa0cd5ab'
      break
    case 4: // rinkeby
      WETH = '0xc778417e063141139fce010982780140aa0cd5ab'
      break
    case 137: // polygon
      WETH = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
      break
    case 80001: // mumbai
      WETH = '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889'
      break
    default:
      throw new Error("unknown network");
  }
  const vusd = await VUSD.deploy()
  console.log("VUSD address:", vusd.address)
  const monoXPool = await MonoXPool.deploy(WETH)
  console.log("MonoXPool address:", monoXPool.address)
  const monoswap = await upgrades.deployProxy(Monoswap, [monoXPool.address, vusd.address])
  console.log("Monoswap address:", monoswap.address)
  await vusd.deployed()
  await monoXPool.deployed()
  await monoswap.deployed()
  
  await vusd.transferOwnership(monoswap.address)
  await monoXPool.transferOwnership(monoswap.address)
  const devAddr = deployer.address
  await monoswap.setFeeTo(devAddr)
  await monoswap.setWhitelister(process.env.MONOSWAP_STAKING_ADDRESS)
  
  await hre.run("verify:verify", {
    address: vusd.address,
    constructorArguments: [
    ],
  })

  await hre.run("verify:verify", {
    address: monoXPool.address,
    constructorArguments: [
      WETH
    ],
  })
  const oz_monoswap = require("../.openzeppelin/" + (network.name === "unknown" ? network.name + "-" + network.chainId : network.name) + ".json")
  const implsLen = Object.keys(oz_monoswap.impls).length;
  const monoswapImplAddress = oz_monoswap.impls[Object.keys(oz_monoswap.impls)[implsLen-1]].address
  console.log("Monoswap Impl Address", monoswapImplAddress)
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