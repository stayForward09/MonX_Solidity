const { ethers, assert, upgrades } = require("hardhat");
const { expect } = require("chai");
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');

const Web3 = require('web3');
const { BigNumber } = require("ethers");
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
        this.uni = await this.MockERC20.deploy('UNI', 'UNI', e26);
        this.aave = await this.MockERC20.deploy('Aave','AAVE',e26); // used to test if exploit is possible at low value of the pool
        this.vusd = await this.vUSD.deploy();

        await this.weth.deposit({value: bigNum(100000000)})
        await this.weth.transfer(this.alice.address, bigNum(10000000))
        await this.yfi.transfer(this.alice.address, bigNum(10000000))
        await this.dai.transfer(this.alice.address, bigNum(10000000))
        await this.uni.transfer(this.alice.address, bigNum(10000000))
        await this.aave.transfer(this.alice.address, bigNum(10000000))  //alice will initiate the pool

        await this.weth.transfer( this.bob.address, bigNum(10000000))
        await this.yfi.transfer( this.bob.address, bigNum(10000000))
        await this.dai.transfer( this.bob.address, bigNum(10000000))
        await this.uni.transfer( this.bob.address, bigNum(10000000))
        await this.aave.transfer(this.bob.address, bigNum(10000000))  //bob will sell and take the price down
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
        await this.uni.connect(this.alice).approve(this.pool.address, e26);
        await this.aave.connect(this.alice).approve(this.pool.address, e26);    //alice approval
        await this.aave.approve(this.pool.address, e26);    //owner approval
        await this.vusd.connect(this.alice).approve(this.pool.address, e26);

        await this.weth.connect(this.bob).approve(this.pool.address, e26);
        await this.yfi.connect(this.bob).approve(this.pool.address, e26);
        await this.dai.connect(this.bob).approve(this.pool.address, e26);
        await this.uni.connect(this.bob).approve(this.pool.address, e26);
        await this.vusd.connect(this.bob).approve(this.pool.address, e26);
        await this.aave.connect(this.bob).approve(this.pool.address, e26);    //bob approval

        await this.pool.addOfficialToken(this.weth.address, bigNum(300))
        await this.pool.addOfficialToken(this.dai.address, bigNum(1))
        await this.pool.addOfficialToken(this.aave.address, bigNum(100))    // aave price starts at 100
        await this.pool.addOfficialToken(this.uni.address, bigNum(30))

        await this.pool.connect(this.alice).addLiquidity(this.weth.address, 
            bigNum(500000), this.alice.address);
        await this.pool.connect(this.alice).addLiquidityETH(
            this.alice.address,
            { ...overrides, value: bigNum(500000) }
            );
            
        await this.pool.connect(this.alice).addLiquidity(this.dai.address, 
            bigNum(1000000), this.alice.address);

        await this.pool.connect(this.alice).addLiquidity(this.aave.address, 
            bigNum(1000), this.alice.address);       // 1000 aave is added by alice

        await this.pool.connect(this.alice).addLiquidity(this.uni.address, 
            bigNum(1000000), this.alice.address);
        
    })


    it('should add liquidity successfully', async function () {
        let ethPool = await this.pool.pools(this.weth.address);
        expect(await ethPool.price.toString()).to.equal(bigNum(300))

        await this.pool.connect(this.bob).addLiquidity(this.weth.address, 
            bigNum(1000000),  this.bob.address);

        ethPool = await this.pool.pools(this.weth.address);
        expect(await ethPool.price.toString()).to.equal(bigNum(300))

        let uniPool = await this.pool.pools(this.uni.address);
        expect(await uniPool.price.toString()).to.equal(bigNum(30))

        await this.pool.connect(this.bob).addLiquidity(this.uni.address, 
            bigNum(1000000),  this.bob.address);

        uniPool = await this.pool.pools(this.uni.address);
        expect(await uniPool.price.toString()).to.equal(bigNum(30))
    });

    it('should purchase and sell ERC-20 successfully', async function () {

        const deadline = (await time.latest()) + 10000

        await this.pool.connect(this.bob).swapExactTokenForToken(
            this.weth.address, this.dai.address, 
            bigNum(2), bigNum(400), this.bob.address, deadline)

        const ethAmount = await this.weth.balanceOf(this.bob.address)
        const daiAmount = await this.dai.balanceOf(this.bob.address)

        const ethPool = await this.pool.pools(this.weth.address);

        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await ethAmount.toString())).to.equal(10000000 - 2)
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
            this.uni.address, this.dai.address, 
            bigNum(2), bigNum(55), this.bob.address, deadline)

        const uniAmount = await this.uni.balanceOf(this.bob.address)
        const daiAmount = await this.dai.balanceOf(this.bob.address)

        const uniPool = await this.pool.pools(this.uni.address);

        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await uniAmount.toString())).to.equal(10000000 - 2)
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(55)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(60)

        expect(smallNum(await daiPool.price.toString())).to.greaterThan(1)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(2)

        expect(smallNum(await uniPool.price.toString())).to.greaterThan(20)
        expect(smallNum(await uniPool.price.toString())).to.lessThan(30)

    });

    it('should purchase and sell vUSD successfully', async function () {

        const deadline = (await time.latest()) + 10000

        await this.pool.connect(this.bob).swapExactTokenForToken(
            this.uni.address, this.vusd.address, 
            bigNum(20), bigNum(400),  this.bob.address, deadline)

        let vusdbob0 = smallNum((await this.vusd.balanceOf(this.bob.address)).toString())

        expect(vusdbob0).to.greaterThan(550)
        expect(vusdbob0).to.lessThan(600)
        
        let uniPool = await this.pool.pools(this.uni.address)
        let uniPrice0 = smallNum(uniPool.price.toString())

        expect(uniPrice0).to.greaterThan(20)
        expect(uniPrice0).to.lessThan(30)

        await this.pool.connect(this.bob).swapTokenForExactToken(
            this.vusd.address, this.uni.address, 
            bigNum(350), bigNum(10),  this.bob.address, deadline)

        let vusdbob1 = smallNum((await this.vusd.balanceOf( this.bob.address)).toString())

        expect(vusdbob0-vusdbob1).to.greaterThan(300)
        expect(vusdbob0-vusdbob1).to.lessThan(302)

        uniPool = await this.pool.pools(this.uni.address)
        const uniPrice1 = smallNum(uniPool.price.toString())
        expect(uniPrice0).to.lessThan(uniPrice1)
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
            this.dai.address, this.uni.address, 
            bigNum(15000), bigNum(450),  this.bob.address, deadline)

        await this.pool.connect(this.bob).addLiquidity(this.uni.address, 
            bigNum(1000000),  this.bob.address);
        const liquidity = (await this.pool.balanceOf(this.alice.address, 3)).toString()

        console.log('liquidity', liquidity);

        const results = await this.pool.connect(this.alice).removeLiquidity(
            this.uni.address, liquidity, this.alice.address, 0, 0);

        let vusdAmount = await this.vusd.balanceOf(this.alice.address)

        expect(smallNum(vusdAmount.toString())).to.greaterThan(500*25/2)
        expect(smallNum(vusdAmount.toString())).to.lessThan(500*30/2)

        let devFee = await this.vusd.balanceOf(this.dev.address)
        console.log(smallNum(devFee.toString()))
    });

    it('should add and remove liquidity ETH successfully', async function () {

        const deadline = (await time.latest()) + 10000
        const initialEthAmount = await ethers.provider.getBalance(this.bob.address)
        await this.pool.connect(this.bob).addLiquidityETH( 
            this.bob.address,
            { ...overrides, value: bigNum(1000000) }
            );
        const liquidity = (await this.pool.balanceOf(this.bob.address, 0)).toString()
        const results = await this.pool.connect(this.bob).removeLiquidityETH(
            liquidity, this.bob.address, 0, 0);

        let vusdAmount = await this.vusd.balanceOf(this.bob.address)
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
        const wethAmount = await this.weth.balanceOf(this.monoXPool.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        

        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(550)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(600)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.greaterThan(2)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.lessThan(3)
        expect(smallNum(await wethAmount.toString())).to.equal(1000000 + 2)

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
        const wethAmount = await this.weth.balanceOf(this.monoXPool.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        

        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(250)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(300)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.greaterThan(1)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.lessThan(2)
        expect(smallNum(await wethAmount.toString())).to.equal(1000000 + 1)

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
        const wethAmount = await this.weth.balanceOf(this.monoXPool.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)

        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(550)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(600)
        
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.greaterThan(1.9)
        expect(smallNum(initialEthAmount.toString()) - smallNum(ethAmount.toString())).to.lessThan(2)
        expect(smallNum(await wethAmount.toString())).to.greaterThan(1000000 + 1)
        expect(smallNum(await wethAmount.toString())).to.lessThan(1000000 + 2)

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
        const wethAmount = await this.weth.balanceOf(this.monoXPool.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        const daiPool = await this.pool.pools(this.dai.address);
        expect(10000000 - smallNum(await daiAmount.toString())).to.equal(610)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.greaterThan(2)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.lessThan(3)
        expect(smallNum(await wethAmount.toString())).to.lessThan(1000000 - 2)
        expect(smallNum(await wethAmount.toString())).to.greaterThan(1000000 - 3)
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
        const wethAmount = await this.weth.balanceOf(this.monoXPool.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        const daiPool = await this.pool.pools(this.dai.address);
        expect(10000000 - smallNum(await daiAmount.toString())).to.equal(305)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.greaterThan(1)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.lessThan(2)
        expect(smallNum(await wethAmount.toString())).to.lessThan(1000000 - 1)
        expect(smallNum(await wethAmount.toString())).to.greaterThan(1000000 - 2)
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
        const wethAmount = await this.weth.balanceOf(this.monoXPool.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(-610)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(-600)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.greaterThan(1.9)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.lessThan(2)
        expect(smallNum(await wethAmount.toString())).to.equal(1000000 - 2)
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
        const wethAmount = await this.weth.balanceOf(this.monoXPool.address)

        const ethPool = await this.pool.pools(this.weth.address)
        const ethAmount = await ethers.provider.getBalance(this.bob.address)
        const daiPool = await this.pool.pools(this.dai.address);
        expect(smallNum(await daiAmount.toString())-10000000).to.greaterThan(-305)
        expect(smallNum(await daiAmount.toString())-10000000).to.lessThan(-300)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.greaterThan(0.9)
        expect(smallNum(ethAmount.toString()) - smallNum(initialEthAmount.toString())).to.lessThan(1)
        expect(smallNum(await wethAmount.toString())).to.equal(1000000 - 1)
        expect(smallNum(await daiPool.price.toString())).to.greaterThan(0.999)
        expect(smallNum(await daiPool.price.toString())).to.lessThan(1)

        expect(smallNum(await ethPool.price.toString())).to.greaterThan(300)
    });

    it('should prevent the owner from altering the price of an active pair in the last 6000 blocks', async function () {
        await expectRevert(
            this.pool.updatePoolPrice(this.weth.address, bigNum(30)),
            'Monoswap: PoolPriceUpdateLocked',
          );
    });

    it('should update last trading block for every trading', async function() {
        const deadline = (await time.latest()) + 10000
        let recipt = await this.pool.connect(this.bob).swapTokenForExactETH(
            this.dai.address, 
            bigNum(305), bigNum(1), this.bob.address, deadline)
        
        let blockNumber = recipt.blockNumber
        let lastTradedBlock = await this.pool.lastTradedBlock(this.dai.address)
        assert(lastTradedBlock.eq(blockNumber))
    })

    it('should allow the admin update pool price after 6000 blocks', async function() {
        this.timeout(0);
        const deadline = (await time.latest()) + 10000
        let recipt = await this.pool.connect(this.bob).swapTokenForExactETH(
            this.dai.address, 
            bigNum(305), bigNum(1), this.bob.address, deadline)
        
        let blockNumber = recipt.blockNumber
        await time.advanceBlockTo(blockNumber + 6001)
        this.pool.updatePoolPrice(this.dai.address, bigNum(2))
        let poolinfo = await this.pool.pools(this.dai.address)
        assert(poolinfo.price.eq(bigNum(2)))
    })
    it('should not remove all liquidity from the contract via exploit', async function () {
        
        const deadline = (await time.latest()) + 10000
        
        const bobAAVEBefore=await this.aave.balanceOf(this.bob.address);

        //exploit begins
        //pool has 1000 aave with 100$ price
        //prerequisites: 2246.57 + 100 AAVE

        await this.pool.connect(this.bob).swapExactTokenForETH(
            this.aave.address, 
            "2246570000000000000000", bigNum(2), this.bob.address, deadline)        // huge sellof so that the pool value is 0.0589351766$ after sale

        const bobETHAfterSale =await ethers.provider.getBalance(this.bob.address);

        const bobAaveLPBefore = (await this.pool.balanceOf(this.bob.address, 2)).toString();

        await this.pool.connect(this.bob).addLiquidity(this.aave.address, 
            bigNum(100), this.bob.address);       // 100 aave is added by bob

        const bobAaveLPAfter = (await this.pool.balanceOf(this.bob.address, 2)).toString();

        await this.pool.connect(this.bob).swapETHForExactToken(
            this.aave.address, 
            bigNum(1000),"2246570000000000000000", this.bob.address, deadline,
            { ...overrides, value: bigNum(1000) }
            )

        console.log('liquidity before/after',bobAaveLPBefore,bobAaveLPAfter);   //we can see bob now has a huge number of lp

        await this.pool.connect(this.bob).removeLiquidity(
            this.aave.address, bobAaveLPAfter, this.bob.address, 0, 0);

        // const bobAAVEAfter=await this.aave.balanceOf(this.bob.address)

        // console.log('bob aave before/after exploit',bobAAVEBefore.toString(),bobAAVEAfter.toString());  // we can see that bob removed all (99.99%) the AAVE from the contract

    });

    it('should balance the liquidity properly', async function () {
        const deadline = (await time.latest()) + 10000

        //selling begins
        //pool has 1000 aave with 100$ price
       

        await this.pool.connect(this.bob).swapExactTokenForETH(
            this.aave.address, 
            "2246570000000000000000", bigNum(2), this.bob.address, deadline)        // huge sellof so that the pool value is 0.0589351766$ after sale

        const bobETHAfterSale =await ethers.provider.getBalance(this.bob.address);
   
        const poolInfo = await this.pool.getPool(this.aave.address);
        console.log('poolinfoBefore',poolInfo.poolValue.toString(),poolInfo.vusdDebt.toString(),poolInfo.vusdCredit.toString(),poolInfo.tokenBalanceVusdValue.toString());
        expect(poolInfo.vusdDebt.toString()).to.equal('100207967701922338036149');    // debt is 100207967701922338036149
   
        const aliceBalanceBeforeRebalancing=await this.aave.balanceOf(this.alice.address);
        
        const poolPriceBeforeRebalancing = ((await this.pool.pools(this.aave.address)).price).toString();

        const poolBalanceBeforeRebalancing = ((await this.pool.pools(this.aave.address)).tokenBalance).toString();

        await this.pool.rebalancePool(this.aave.address,'100207967701922338036149');

        const poolInfoAfterBalance = await this.pool.getPool(this.aave.address);  
        
        console.log('poolinfoAfter',poolInfoAfterBalance.poolValue.toString(),poolInfoAfterBalance.vusdDebt.toString(),poolInfoAfterBalance.vusdCredit.toString(),poolInfoAfterBalance.tokenBalanceVusdValue.toString());

        const poolPriceAfterRebalancing = ((await this.pool.pools(this.aave.address)).price).toString();

        const poolBalanceAfterRebalancing = ((await this.pool.pools(this.aave.address)).tokenBalance).toString();

        const aliceBalanceAfterRebalancing=await this.aave.balanceOf(this.alice.address);

        console.log('pool price before/after',poolPriceBeforeRebalancing,poolPriceAfterRebalancing);

        console.log('pool balance before/after',poolBalanceBeforeRebalancing,poolBalanceAfterRebalancing);

        console.log('tokens received by owner',aliceBalanceAfterRebalancing-aliceBalanceBeforeRebalancing);

        expect(poolInfoAfterBalance.vusdDebt.toString()).to.equal('0'); //we expect the new debt to be 0

        expect(poolPriceAfterRebalancing).to.equal(poolPriceBeforeRebalancing);

        expect(parseInt(poolInfoAfterBalance.poolValue.toString())).to.greaterThan(poolInfo.poolValue.toString() - 50);  // pool value should remain the same. There's an issue here because of the precision
        expect(parseInt(poolInfoAfterBalance.poolValue.toString())).to.lessThan(parseInt(poolInfo.poolValue.toString()) + 50);
    });

    it('should add price adjuster and adjust price', async function () {

        await this.pool.updatePoolStatus(this.aave.address,3);  //make the pool synthetic

        await this.pool.addPriceAdjuster(this.bob.address);
        expect(await this.pool.priceAdjusterRole(this.bob.address)).to.equal(true); //role granted

        await this.pool.connect(this.bob).setPoolPrice(this.aave.address,"100000000000");   
        expect(((await this.pool.pools(this.aave.address)).price).toString()).to.equal("100000000000"); //price changed

        await this.pool.removePriceAdjuster(this.bob.address);      //remove role
        expect(await this.pool.priceAdjusterRole(this.bob.address)).to.equal(false);

    });



});