const { ethers, assert, upgrades } = require("hardhat");
const { expect } = require("chai");
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');

const Web3 = require('web3');
const { utils } = Web3;

const e18 = 1 + '0'.repeat(18)
const e26 = 1 + '0'.repeat(26)
const e24 = 1 + '0'.repeat(24)

const bigNum = num=>(num + '0'.repeat(18))
const smallNum = num=>(parseInt(num)/bigNum(1))
const PoolStatus = {
    UNLISTED: 0,
    LISTED: 1,
    OFFICIAL: 2
}

const overrides = {
    gasLimit: 9500000
}
const DEFAULT_ETH_AMOUNT = 10000000000

describe('OptionVaultPair', function () {
    before(async function () {
        this.signers = await ethers.getSigners()
        this.alice = this.signers[0]
        this.bob = this.signers[1]
        this.carol = this.signers[2]
        this.dev = this.signers[3]
        this.minter = this.signers[4]
        this.Monoswap = await ethers.getContractFactory('Monoswap');
        this.MockERC20 = await ethers.getContractFactory('MockERC20');
        this.WETH9 = await ethers.getContractFactory('WETH9');
        this.vUSD = await ethers.getContractFactory('VUSD');
        this.MonoXPool = await ethers.getContractFactory('MonoXPool');
        
    })
    
    beforeEach(async function () {
        this.weth = await this.WETH9.deploy();
        this.yfi = await this.MockERC20.deploy('YFI', 'YFI', e26);
        this.dai = await this.MockERC20.deploy('Dai', 'DAI', e26);
        this.vusd = await this.vUSD.deploy();

        await this.weth.deposit({value: bigNum(100000000)})
        await this.weth.transfer(this.alice.address, bigNum(10000000))
        await this.yfi.transfer(this.alice.address, bigNum(10000000))
        await this.dai.transfer(this.alice.address, bigNum(10000000))

        await this.weth.transfer( this.bob.address, bigNum(10000000))
        await this.yfi.transfer( this.bob.address, bigNum(10000000))
        await this.dai.transfer( this.bob.address, bigNum(10000000))
        this.monoXPool = await this.MonoXPool.deploy(this.weth.address)
        // this.pool = await this.Monoswap.deploy(this.monoXPool.address, this.vusd.address, this.weth.address)
        this.pool = await upgrades.deployProxy(this.Monoswap, [this.monoXPool.address, this.vusd.address])
        this.vusd.transferOwnership(this.pool.address)
        this.monoXPool.transferOwnership(this.pool.address)
        this.pool.setFeeTo(this.dev.address)

        const timestamp = (await time.latest()) + 10000;

        await this.weth.connect(this.alice).approve(this.pool.address, e26);
        await this.yfi.connect(this.alice).approve(this.pool.address, e26);
        await this.dai.connect(this.alice).approve(this.pool.address, e26);
        await this.vusd.connect(this.alice).approve(this.pool.address, e26);

        await this.weth.connect(this.bob).approve(this.pool.address, e26);
        await this.yfi.connect(this.bob).approve(this.pool.address, e26);
        await this.dai.connect(this.bob).approve(this.pool.address, e26);
        await this.vusd.connect(this.bob).approve(this.pool.address, e26);

        await this.pool.addOfficialToken(this.weth.address, bigNum(300))
        await this.pool.addOfficialToken(this.dai.address, bigNum(1))

        await this.pool.connect(this.alice).addLiquidity(this.weth.address, 
            bigNum(500000), this.alice.address);
        await this.pool.connect(this.alice).addLiquidityETH(
            bigNum(500000), this.alice.address);
        await this.pool.connect(this.alice).addLiquidity(this.dai.address, 
            bigNum(1000000), this.alice.address);
    })


    it('should add liquidity successfully', async function () {
        let ethPool = await this.pool.pools(this.weth.address);
        expect(await ethPool.price.toString()).to.equal(bigNum(300))

        await this.pool.connect(this.bob).addLiquidity(this.weth.address, 
            bigNum(1000000),  this.bob.address);

        ethPool = await this.pool.pools(this.weth.address);
        expect(await ethPool.price.toString()).to.equal(bigNum(300))
        
    });

    it('should purchase and sell ERC-20 successfully', async function () {

        const deadline = (await time.latest()) + 10000

        await this.pool.connect(this.bob).swapExactTokenForToken(
            this.weth.address, this.dai.address, 
            bigNum(2), bigNum(400), this.bob.address, deadline)

        const daiAmount = await this.dai.balanceOf(this.bob.address)

        const ethPool = await this.pool.pools(this.weth.address);

        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(550)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(600)

        expect(smallNum(await daiPool.price.toString())).to.greaterThan(1)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(2)

        expect(smallNum(await ethPool.price.toString())).to.greaterThan(200)
        expect(smallNum(await ethPool.price.toString())).to.lessThan(300)
    });

    it('should purchase and sell ERC-20 successfully - 2', async function () {

        const deadline = (await time.latest()) + 10000

        await this.pool.connect(this.bob).swapExactTokenForToken(
            this.weth.address, this.dai.address, 
            bigNum(1), bigNum(200), this.bob.address, deadline)

        const daiAmount = await this.dai.balanceOf(this.bob.address)

        const ethPool = await this.pool.pools(this.weth.address);

        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(290)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(300)

        expect(smallNum(await daiPool.price.toString())).to.greaterThan(1)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(2)

        expect(smallNum(await ethPool.price.toString())).to.greaterThan(200)
        expect(smallNum(await ethPool.price.toString())).to.lessThan(300)
    });

    it('should purchase and sell vUSD successfully', async function () {

        const deadline = (await time.latest()) + 10000

        await this.pool.connect(this.bob).swapExactTokenForToken(
            this.weth.address, this.vusd.address, 
            bigNum(20), bigNum(4000),  this.bob.address, deadline)

        let vusdbob0 = smallNum((await this.vusd.balanceOf(this.bob.address)).toString())

        expect(vusdbob0).to.greaterThan(5500)
        expect(vusdbob0).to.lessThan(6000)
        
        let ethPool = await this.pool.pools(this.weth.address)
        let ethPrice0 = smallNum(ethPool.price.toString())

        expect(ethPrice0).to.greaterThan(200)
        expect(ethPrice0).to.lessThan(300)

        // console.log('ETH price', ethPrice0)

        await this.pool.connect(this.bob).swapTokenForExactToken(
            this.vusd.address, this.weth.address, 
            bigNum(3500), bigNum(10),  this.bob.address, deadline)

        let vusdbob1 = smallNum((await this.vusd.balanceOf( this.bob.address)).toString())

        expect(vusdbob0-vusdbob1).to.greaterThan(3000)
        expect(vusdbob0-vusdbob1).to.lessThan(3020)

        ethPool = await this.pool.pools(this.weth.address)
        const ethPrice1 = smallNum(ethPool.price.toString())
        // console.log('ETH price', ethPrice1)
        expect(ethPrice0).to.lessThan(ethPrice1)
    });

    it('should remove liquidity successfully', async function () {

        const deadline = (await time.latest()) + 10000

        await this.pool.connect(this.bob).swapExactTokenForToken(
            this.dai.address, this.weth.address, 
            bigNum(15000), bigNum(45),  this.bob.address, deadline)
        const liquidity = (await this.pool.balanceOf(this.alice.address, 0)).toString()

        console.log('liquidity', liquidity);

        const results = await this.pool.connect(this.alice).removeLiquidity(
            this.weth.address, liquidity, this.alice.address, 0, 0);

        let vusdAmount = await this.vusd.balanceOf(this.alice.address)

        expect(smallNum(vusdAmount.toString())).to.greaterThan(50*250)
        expect(smallNum(vusdAmount.toString())).to.lessThan(50*300)

        let devFee = await this.vusd.balanceOf(this.dev.address)
        console.log(smallNum(devFee.toString()))
    });

    it('should add and remove liquidity successfully', async function () {

        const deadline = (await time.latest()) + 10000

        await this.pool.connect(this.bob).swapExactTokenForToken(
            this.dai.address, this.weth.address, 
            bigNum(15000), bigNum(45),  this.bob.address, deadline)

        await this.pool.connect(this.bob).addLiquidity(this.weth.address, 
            bigNum(1000000),  this.bob.address);
        const liquidity = (await this.pool.balanceOf(this.alice.address, 0)).toString()

        console.log('liquidity', liquidity);

        const results = await this.pool.connect(this.alice).removeLiquidity(
            this.weth.address, liquidity, this.alice.address, 0, 0);

        let vusdAmount = await this.vusd.balanceOf(this.alice.address)

        expect(smallNum(vusdAmount.toString())).to.greaterThan(50*250/2)
        expect(smallNum(vusdAmount.toString())).to.lessThan(50*300/2)

        let devFee = await this.vusd.balanceOf(this.dev.address)
        console.log(smallNum(devFee.toString()))
    });

    it('should add and remove liquidity ETH successfully', async function () {

        const deadline = (await time.latest()) + 10000
        const initialEthAmount = await ethers.provider.getBalance(this.bob.address)
        await this.pool.connect(this.bob).addLiquidityETH( 
            bigNum(1000000),  this.bob.address);
        const liquidity = (await this.pool.balanceOf(this.alice.address, 0)).toString()

        const results = await this.pool.connect(this.alice).removeLiquidityETH(
            liquidity, this.alice.address, 0, 0);

        let vusdAmount = await this.vusd.balanceOf(this.alice.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.lessThan(1) // consider gas fee
        expect(smallNum(vusdAmount.toString())).to.equal(0)
    });

    it('should list new tokens successfully', async function () {

        const deadline = (await time.latest()) + 10000

        await this.pool.connect(this.bob).listNewToken(
            this.yfi.address, bigNum(20000), 
            0, bigNum(20),  this.bob.address)

        const yfiAlice0 = smallNum((await this.yfi.balanceOf(this.alice.address)).toString())
        const daiAlice0 = smallNum((await this.dai.balanceOf(this.alice.address)).toString())

        let yfiPool = await this.pool.pools(this.yfi.address)
        const yfiPrice0 = smallNum(yfiPool.price.toString())

        await this.pool.connect(this.alice).swapTokenForExactToken(
            this.dai.address, this.yfi.address, 
            bigNum(30000), bigNum(1), this.alice.address, deadline)

        const yfiAlice1 = smallNum((await this.yfi.balanceOf(this.alice.address)).toString())
        const daiAlice1 = smallNum((await this.dai.balanceOf(this.alice.address)).toString())
        expect((yfiAlice1-yfiAlice0).toPrecision(1)).to.equal('1')
        expect(daiAlice0-daiAlice1).to.greaterThan(20000)
        expect(daiAlice0-daiAlice1).to.lessThan(22000)

        yfiPool = await this.pool.pools(this.yfi.address)
        const yfiPrice1 = smallNum(yfiPool.price.toString())

        expect(yfiPrice1).to.greaterThan(yfiPrice0)
        console.log('yfi', yfiPrice1, yfiPrice0)
        
    });

    it('update pool status successfully', async function () {
        await this.pool.updatePoolStatus(this.weth.address, PoolStatus.LISTED) 
        let ethPool = await this.pool.pools(this.weth.address)
        expect(ethPool.status).to.equal(PoolStatus.LISTED)

        await this.pool.updatePoolStatus(this.dai.address, PoolStatus.UNLISTED) 
        let daiPool = await this.pool.pools(this.dai.address)
        expect(daiPool.status).to.equal(PoolStatus.UNLISTED)
    });

    it('should purchase and sell ETH successfully - swapExactETHForToken', async function () {
        const deadline = (await time.latest()) + 10000
        const initialEthAmount = await ethers.provider.getBalance(this.bob.address)

        await this.pool.connect(this.bob).swapExactETHForToken(this.dai.address, 
            bigNum(400), this.bob.address, deadline, 
            { ...overrides, value: bigNum(2) }
            )

        const daiAmount = await this.dai.balanceOf(this.bob.address)
        const wethAmount = await this.weth.balanceOf(this.bob.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        

        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(550)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(600)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.greaterThan(2)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.lessThan(3)
        expect(smallNum(await wethAmount.toString())).to.equal(10000000)

        expect(smallNum(await daiPool.price.toString())).to.greaterThan(1)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(2)

        expect(smallNum(await ethPool.price.toString())).to.greaterThan(200)
        expect(smallNum(await ethPool.price.toString())).to.lessThan(300)
    });

    it('should purchase and sell ETH successfully - swapExactETHForToken - 2', async function () {
        const deadline = (await time.latest()) + 10000
        const initialEthAmount = await ethers.provider.getBalance(this.bob.address)

        await this.pool.connect(this.bob).swapExactETHForToken(this.dai.address, 
            bigNum(200), this.bob.address, deadline, 
            { ...overrides, value: bigNum(1) }
            )

        const daiAmount = await this.dai.balanceOf(this.bob.address)
        const wethAmount = await this.weth.balanceOf(this.bob.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        

        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(250)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(300)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.greaterThan(1)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.lessThan(2)
        expect(smallNum(await wethAmount.toString())).to.equal(10000000)

        expect(smallNum(await daiPool.price.toString())).to.greaterThan(1)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(2)

        expect(smallNum(await ethPool.price.toString())).to.greaterThan(200)
        expect(smallNum(await ethPool.price.toString())).to.lessThan(300)
    });

    it('should purchase and sell ERC-20 successfully - swapETHForExactToken', async function () {
        const deadline = (await time.latest()) + 10000
        const initialEthAmount = await ethers.provider.getBalance(this.bob.address)

        await this.pool.connect(this.bob).swapETHForExactToken(
            this.dai.address, 
            bigNum(2), bigNum(590), this.bob.address, deadline,
            { ...overrides, value: bigNum(2) }
            )
        
        const daiAmount = await this.dai.balanceOf(this.bob.address)
        const wethAmount = await this.weth.balanceOf(this.bob.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)

        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(550)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(600)
        
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.greaterThan(1.9)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.lessThan(2)
        expect(smallNum(await wethAmount.toString())).to.equal(10000000)

        expect(smallNum(await daiPool.price.toString())).to.greaterThan(1)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(2)

        expect(smallNum(await ethPool.price.toString())).to.greaterThan(200)
        expect(smallNum(await ethPool.price.toString())).to.lessThan(300)
    });

    it('should purchase and sell ERC-20 successfully - swapETHForExactToken - 2', async function () {
        const deadline = (await time.latest()) + 10000
        const initialEthAmount = await ethers.provider.getBalance(this.bob.address)

        await this.pool.connect(this.bob).swapETHForExactToken(
            this.dai.address, 
            bigNum(1), bigNum(295), this.bob.address, deadline,
            { ...overrides, value: bigNum(1) }
            )
        
        const daiAmount = await this.dai.balanceOf(this.bob.address)
        const wethAmount = await this.weth.balanceOf(this.bob.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)

        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(250)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(300)
        
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.greaterThan(0.9)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.lessThan(1)
        expect(smallNum(await wethAmount.toString())).to.equal(10000000)

        expect(smallNum(await daiPool.price.toString())).to.greaterThan(1)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(2)

        expect(smallNum(await ethPool.price.toString())).to.greaterThan(200)
        expect(smallNum(await ethPool.price.toString())).to.lessThan(300)
    });

    it('should purchase and sell ERC-20 successfully - swapExactTokenForETH', async function () {
        const deadline = (await time.latest()) + 10000
        const initialEthAmount = await ethers.provider.getBalance(this.bob.address)
        await this.pool.connect(this.bob).swapExactTokenForETH(
            this.dai.address, 
            bigNum(610), bigNum(2), this.bob.address, deadline)
        
        const daiAmount = await this.dai.balanceOf(this.bob.address)
        const wethAmount = await this.weth.balanceOf(this.bob.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        const daiPool = await this.pool.pools(this.dai.address);
        expect(10000000 - smallNum(await daiAmount.toString())).to.equal(610)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.greaterThan(2)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.lessThan(3)
        expect(smallNum(await wethAmount.toString())).to.equal(10000000)
        expect(smallNum(await daiPool.price.toString())).to.greaterThan(0.999)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(1)
        expect(smallNum(await ethPool.price.toString())).to.greaterThan(300)
    });

    it('should purchase and sell ERC-20 successfully - swapExactTokenForETH - 2', async function () {
        const deadline = (await time.latest()) + 10000
        const initialEthAmount = await ethers.provider.getBalance(this.bob.address)
        await this.pool.connect(this.bob).swapExactTokenForETH(
            this.dai.address, 
            bigNum(305), bigNum(1), this.bob.address, deadline)
        
        const daiAmount = await this.dai.balanceOf(this.bob.address)
        const wethAmount = await this.weth.balanceOf(this.bob.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        const daiPool = await this.pool.pools(this.dai.address);
        expect(10000000 - smallNum(await daiAmount.toString())).to.equal(305)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.greaterThan(1)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.lessThan(2)
        expect(smallNum(await wethAmount.toString())).to.equal(10000000)
        expect(smallNum(await daiPool.price.toString())).to.greaterThan(0.999)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(1)
        expect(smallNum(await ethPool.price.toString())).to.greaterThan(300)
    });
    
    it('should purchase and sell ERC-20 successfully - swapTokenforExactETH', async function () {
        const deadline = (await time.latest()) + 10000
        const initialEthAmount = await ethers.provider.getBalance(this.bob.address)
        await this.pool.connect(this.bob).swapTokenForExactETH(
            this.dai.address, 
            bigNum(610), bigNum(2), this.bob.address, deadline)
        
        const daiAmount = await this.dai.balanceOf(this.bob.address)
        const wethAmount = await this.weth.balanceOf(this.bob.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(-610)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(-600)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.greaterThan(1.9)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.lessThan(2)
        expect(smallNum(await wethAmount.toString())).to.equal(10000000)
        expect(smallNum(await daiPool.price.toString())).to.greaterThan(0.999)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(1)

        expect(smallNum(await ethPool.price.toString())).to.greaterThan(300)
    });

    it('should purchase and sell ERC-20 successfully - swapTokenforExactETH - 2', async function () {
        const deadline = (await time.latest()) + 10000
        const initialEthAmount = await ethers.provider.getBalance(this.bob.address)
        await this.pool.connect(this.bob).swapTokenForExactETH(
            this.dai.address, 
            bigNum(305), bigNum(1), this.bob.address, deadline)
        
        const daiAmount = await this.dai.balanceOf(this.bob.address)
        const wethAmount = await this.weth.balanceOf(this.bob.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(-305)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(-300)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.greaterThan(0.9)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.lessThan(1)
        expect(smallNum(await wethAmount.toString())).to.equal(10000000)
        expect(smallNum(await daiPool.price.toString())).to.greaterThan(0.999)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(1)

        expect(smallNum(await ethPool.price.toString())).to.greaterThan(300)
    });

});