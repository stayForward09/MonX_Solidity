usePlugin("@nomiclabs/buidler-truffle5");
usePlugin('solidity-coverage')
usePlugin('buidler-gas-reporter')

module.exports = {
  defaultNetwork: "buidlerevm",
    networks: {
      buidlerevm: {
        network_id: "*",
        gasPrice: 1,
        blockGasLimit: 80000000,
        gas: 80000000,
      },
    development: {
      url: "http://127.0.0.1",
      port: 8545,
      network_id: "*",
      gasPrice: 1,
      gas: 80000000,
    },
  },
  solc: {
    version: "0.6.12",
    optimizer: {
      enabled: true,
      runs: 20
    }
  },
}