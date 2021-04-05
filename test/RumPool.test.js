const { ethers } = require("hardhat");
const { expect } = require("chai");
const { expectRevert, time } = require('@openzeppelin/test-helpers');


const e18 = 1 + '0'.repeat(18)
const e26 = 1 + '0'.repeat(26)
const e24 = 1 + '0'.repeat(24)

const bigNum = num=>(num + '0'.repeat(18))
const smallNum = num=>(parseInt(num)/bigNum(1))

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
        this.vUSD = await ethers.getContractFactory('VUSD');
        this.MonoswapToken = await ethers.getContractFactory('MonoswapToken');
    })
    
    beforeEach(async function () {
        this.weth = await this.MockERC20.deploy('WETH', 'WETH', e26);
        this.yfi = await this.MockERC20.deploy('YFI', 'YFI', e26);
        this.dai = await this.MockERC20.deploy('Dai', 'DAI', e26);
        this.vusd = await this.vUSD.deploy();

        await this.weth.transfer(this.alice.address, bigNum(10000000))
        await this.yfi.transfer(this.alice.address, bigNum(10000000))
        await this.dai.transfer(this.alice.address, bigNum(10000000))

        await this.weth.transfer( this.bob.address, bigNum(10000000))
        await this.yfi.transfer( this.bob.address, bigNum(10000000))
        await this.dai.transfer( this.bob.address, bigNum(10000000))
        this.monoswapToken = await this.MonoswapToken.deploy()
        this.pool = await this.Monoswap.deploy(this.monoswapToken.address, this.vusd.address)
        // this.pool = await deployProxy(Monoswap, [this.monoswapToken.address, this.vusd.address])
        this.vusd.transferOwnership(this.pool.address)
        this.monoswapToken.transferOwnership(this.pool.address)
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
            bigNum(1000000), this.alice.address);
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

    // it('should purchase and sell vUSD successfully', async () => {

    //     const deadline = (await time.latest()) + 10000

    //     await this.pool.swapExactTokenForToken(
    //         this.weth.address, this.vusd.address, 
    //         bigNum(20), bigNum(4000),  this.bob, deadline,
    //         {from:  this.bob})

    //     let vusdbob0 = smallNum((await this.vusd.balanceOf( this.bob)).toString())

    //     assert.isBelow(vusdbob0, 6000)
    //     assert.isAbove(vusdbob0, 5500)

    //     let ethPool = await this.pool.pools(this.weth.address)
    //     let ethPrice0 = smallNum(ethPool.price.toString())

    //     assert.isAbove(ethPrice0, 200)
    //     assert.isBelow(ethPrice0, 300)

    //     console.log('ETH price', ethPrice0)

    //     await this.pool.swapTokenForExactToken(
    //         this.vusd.address, this.weth.address, 
    //         bigNum(3500), bigNum(10),  this.bob, deadline,
    //         {from:  this.bob})

    //     let vusdbob1 = smallNum((await this.vusd.balanceOf( this.bob)).toString())

    //     assert.isBelow(vusdbob0-vusdbob1, 3020)
    //     assert.isAbove(vusdbob0-vusdbob1, 3000)

    //     ethPool = await this.pool.pools(this.weth.address)
    //     const ethPrice1 = smallNum(ethPool.price.toString())
    //     console.log('ETH price', ethPrice1)
    //     assert.isBelow(ethPrice0, ethPrice1)
        
    // });

    // it('should remove liquidity successfully', async () => {

    //     const deadline = (await time.latest()) + 10000

    //     await this.pool.swapExactTokenForToken(
    //         this.dai.address, this.weth.address, 
    //         bigNum(15000), bigNum(45),  this.bob, deadline,
    //         {from:  this.bob})
    //     const liquidity = (await this.monoswapToken.balanceOf(this.alice, 0)).toString()

    //     console.log('liquidity', liquidity);

    //     const results = await this.pool.removeLiquidity(
    //         this.weth.address, liquidity, this.this.alice, 0, 0, {from: this.this.alice});

    //     let vusdAmount = await this.vusd.balanceOf(this.alice)

    //     assert.isBelow(smallNum(vusdAmount.toString()), 50*300)
    //     assert.isAbove(smallNum(vusdAmount.toString()), 50*250)

    //     let devFee = await this.vusd.balanceOf(this.dev)
    //     console.log(smallNum(devFee.toString()))
        
    // });

    // it('should add and remove liquidity successfully', async () => {

    //     const deadline = (await time.latest()) + 10000

    //     await this.pool.swapExactTokenForToken(
    //         this.dai.address, this.weth.address, 
    //         bigNum(15000), bigNum(45),  this.bob, deadline,
    //         {from:  this.bob})

    //     await this.pool.addLiquidity(this.weth.address, 
    //         bigNum(1000000),  this.bob, {from:  this.bob});
    //     const liquidity = (await this.monoswapToken.balanceOf(this.alice, 0)).toString()

    //     console.log('liquidity', liquidity);

    //     const results = await this.pool.removeLiquidity(
    //         this.weth.address, liquidity, this.this.alice, 0, 0, {from: this.this.alice});

    //     let vusdAmount = await this.vusd.balanceOf(this.alice)

    //     assert.isBelow(smallNum(vusdAmount.toString()), 50*300/2)
    //     assert.isAbove(smallNum(vusdAmount.toString()), 50*250/2)

    //     let devFee = await this.vusd.balanceOf(this.dev)
    //     console.log(smallNum(devFee.toString()))
        
    // });

    // it('should list new tokens successfully', async () => {

    //     const deadline = (await time.latest()) + 10000

    //     await this.pool.listNewToken(
    //         this.yfi.address, bigNum(20000), 
    //         0, bigNum(20),  this.bob, {from:  this.bob})

    //     const yfiAlice0 = smallNum((await this.yfi.balanceOf(this.alice)).toString())
    //     const daiAlice0 = smallNum((await this.dai.balanceOf(this.alice)).toString())

    //     let yfiPool = await this.pool.pools(this.yfi.address)
    //     const yfiPrice0 = smallNum(yfiPool.price.toString())

    //     await this.pool.swapTokenForExactToken(
    //         this.dai.address, this.yfi.address, 
    //         bigNum(30000), bigNum(1), this.this.alice, deadline,
    //         {from: this.this.alice})

    //     const yfiAlice1 = smallNum((await this.yfi.balanceOf(this.alice)).toString())
    //     const daiAlice1 = smallNum((await this.dai.balanceOf(this.alice)).toString())
    //     assert.equal(yfiAlice1-yfiAlice0, 1)
    //     assert.isBelow(daiAlice0-daiAlice1, 22000)
    //     assert.isAbove(daiAlice0-daiAlice1, 20000)

    //     yfiPool = await this.pool.pools(this.yfi.address)
    //     const yfiPrice1 = smallNum(yfiPool.price.toString())

    //     assert.isAbove(yfiPrice1, yfiPrice0)
    //     console.log('yfi', yfiPrice1, yfiPrice0)
        
    // });

});