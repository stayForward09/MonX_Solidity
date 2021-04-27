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
  const Monoswap = await ethers.getContractFactory("Monoswap")

  const monoswap = await upgrades.upgradeProxy(process.env.MONOSWAP_CORE_ADDRESS, Monoswap)
  console.log("Monoswap address:", monoswap.address)
  await monoswap.deployed()
  
  const oz_monoswap = require("../.openzeppelin/" + network + ".json")
  const implsLen = Object.keys(oz_monoswap.impls).length;
  const monoswapImplAddress = oz_monoswap.impls[Object.keys(oz_monoswap.impls)[implsLen -1]].address
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