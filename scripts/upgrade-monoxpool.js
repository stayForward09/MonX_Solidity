const hre = require("hardhat")
const { ethers, upgrades } = require("hardhat")
async function main() {
  
  const [deployer] = await ethers.getSigners()

  console.log(
    "Deploying contracts with the account:",
    deployer.address
  )
  
  console.log("Account balance:", (await deployer.getBalance()).toString())
  const network = (await ethers.provider.getNetwork()).name
  const MonoXPool = await ethers.getContractFactory("MonoXPool")

  const monoXPool = await upgrades.upgradeProxy(process.env.MONOXPOOL_ADDRESS, MonoXPool)
  console.log("MonoXPool address:", monoXPool.address)
  await monoXPool.deployed()
  
  const oz_monoswap = require("../.openzeppelin/" + network + ".json")
  const monoXPoolImplAddress = oz_monoswap.impls[Object.keys(oz_monoswap.impls)[0]].address
  console.log("MonoXPool Impl Address", monoXPoolImplAddress)
  await hre.run("verify:verify", {
    address: monoXPoolImplAddress,
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