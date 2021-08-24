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
  
  const vusd = await VUSD.attach(process.env.VUSD_ADDRESS)
  const monoXPool = await MonoXPool.attach(process.env.MONOXPOOL_ADDRESS)
  const monoswap = await upgrades.deployProxy(Monoswap, [monoXPool.address, vusd.address])
  console.log("Monoswap address:", monoswap.address)
  await monoswap.deployed()
  
  await vusd.transferOwnership(monoswap.address)
  await monoXPool.transferOwnership(monoswap.address)
  await monoswap.setFeeTo(deployer.address)
  
  const oz_monoswap = require("../.openzeppelin/" + (network.name === "unknown" ? network.name + "-" + network.chainId : network.name) + ".json")
  // const implsLen = Object.keys(oz_monoswap.impls).length;
  const monoswapImplAddress = oz_monoswap.impls[Object.keys(oz_monoswap.impls)[1]].address
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