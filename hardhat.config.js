require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-ethers");
require('@openzeppelin/hardhat-upgrades');
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require("dotenv/config")
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
require("solidity-coverage");
require('hardhat-contract-sizer');

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("set-official-pool", "Sets a pool to official")
  .addParam("monoswap", "MONO core's address")
  .addParam("pool", "pool token address")
  .setAction(async (args) => {

  const [deployer] = await ethers.getSigners();

  if(!(ethers.utils.isAddress(args.monoswap) && ethers.utils.isAddress(args.pool))){
    console.log(args)
    throw new Error("bad args");
  }

  console.log(
    "Deploying contracts with the account:",
    deployer.address
  );
  
  console.log("Account balance:", (await deployer.getBalance()).toString());
  
  const Monoswap = await ethers.getContractFactory("Monoswap");
  const monoswap = await Monoswap.attach(args.monoswap);
  await monoswap.updatePoolStatus(args.pool, 2);

  console.log("success");
})

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 20
      }
    }
  },
  networks: {
    hardhat: {
      accounts: {
        accountsBalance: '10000000000000000000000000000' // 10000000000 ETH
      }
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    },
    mumbai: {
      url: "https://naughty-blackwell:waffle-sprawl-math-used-ripple-snarl@nd-311-035-380.p2pify.com",
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    },
    matic: {
      url: "https://rpc-mainnet.matic.network",
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    // apiKey: process.env.MATIC_API_KEY,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
};

