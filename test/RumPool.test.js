const { expectRevert, time } = require('@openzeppelin/test-helpers');
const Monoswap = artifacts.require('Monoswap');
const MockERC20 = artifacts.require('MockERC20');
const vUSD = artifacts.require('VUSD');

const e18 = 1 + '0'.repeat(18)
const e26 = 1 + '0'.repeat(26)
const e24 = 1 + '0'.repeat(24)

const bigNum = num=>(num + '0'.repeat(18))
const smallNum = num=>(parseInt(num)/bigNum(1))

contract('OptionVaultPair', ([alice, bob, minter, dev]) => {
    beforeEach(async () => {
        this.weth = await MockERC20.new('WETH', 'WETH', e26, {from: minter});
        this.yfi = await MockERC20.new('YFI', 'YFI', e26, {from: minter});
        this.dai = await MockERC20.new('Dai', 'DAI', e26, {from: minter});
        this.vusd = await vUSD.new({from: minter});

        await this.weth.transfer(alice, bigNum(10000000), {from: minter})
        await this.yfi.transfer(alice, bigNum(10000000), {from: minter})
        await this.dai.transfer(alice, bigNum(10000000), {from: minter})

        await this.weth.transfer(bob, bigNum(10000000), {from: minter})
        await this.yfi.transfer(bob, bigNum(10000000), {from: minter})
        await this.dai.transfer(bob, bigNum(10000000), {from: minter})

        this.pool = await Monoswap.new(this.vusd.address, {from: minter})
        this.vusd.transferOwnership(this.pool.address, {from: minter})
        this.pool.setFeeTo(dev, {from: minter})

        const timestamp = (await time.latest()) + 10000;

        await this.weth.approve(this.pool.address, e26, {from: alice});
        await this.yfi.approve(this.pool.address, e26, {from: alice});
        await this.dai.approve(this.pool.address, e26, {from: alice});
        await this.vusd.approve(this.pool.address, e26, {from: alice});

        await this.weth.approve(this.pool.address, e26, {from: bob});
        await this.yfi.approve(this.pool.address, e26, {from: bob});
        await this.dai.approve(this.pool.address, e26, {from: bob});
        await this.vusd.approve(this.pool.address, e26, {from: bob});

        await this.pool.addOfficialToken(this.weth.address, bigNum(300), {from: minter})
        await this.pool.addOfficialToken(this.dai.address, bigNum(1), {from: minter})

        await this.pool.addLiquidity(this.weth.address, 
            bigNum(1000000), alice, {from: alice});
        await this.pool.addLiquidity(this.dai.address, 
            bigNum(1000000), alice, {from: alice});
    })


    it('should add liquidity successfully', async () => {

        let ethPool = await this.pool.pools(this.weth.address);
        assert.equal(ethPool.price.toString(), bigNum(300))

        await this.pool.addLiquidity(this.weth.address, 
            bigNum(1000000), bob, {from: bob});

        ethPool = await this.pool.pools(this.weth.address);
        assert.equal(ethPool.price.toString(), bigNum(300))
        
    });

    it('should purchase and sell ERC-20 successfully', async () => {

        const deadline = (await time.latest()) + 10000

        await this.pool.swapExactTokenForToken(
            this.weth.address, this.dai.address, 
            bigNum(2), bigNum(400), bob, deadline, {from: bob})

        const daiAmount = await this.dai.balanceOf(bob)

        const ethPool = await this.pool.pools(this.weth.address);

        const daiPool = await this.pool.pools(this.dai.address);

        assert.isBelow(smallNum(daiAmount.toString())-10000000, 600)
        assert.isAbove(smallNum(daiAmount.toString())-10000000, 550)

        assert.isAbove(smallNum(daiPool.price.toString()), 1)
        assert.isBelow(smallNum(daiPool.price.toString()), 2)

        assert.isAbove(smallNum(ethPool.price.toString()), 200)
        assert.isBelow(smallNum(ethPool.price.toString()), 300)
        
    });

    it('should purchase and sell vUSD successfully', async () => {

        const deadline = (await time.latest()) + 10000

        await this.pool.swapExactTokenForToken(
            this.weth.address, this.vusd.address, 
            bigNum(20), bigNum(4000), bob, deadline,
            {from: bob})

        let vusdBob0 = smallNum((await this.vusd.balanceOf(bob)).toString())

        assert.isBelow(vusdBob0, 6000)
        assert.isAbove(vusdBob0, 5500)

        let ethPool = await this.pool.pools(this.weth.address)
        let ethPrice0 = smallNum(ethPool.price.toString())

        assert.isAbove(ethPrice0, 200)
        assert.isBelow(ethPrice0, 300)

        console.log('ETH price', ethPrice0)

        await this.pool.swapTokenForExactToken(
            this.vusd.address, this.weth.address, 
            bigNum(3500), bigNum(10), bob, deadline,
            {from: bob})

        let vusdBob1 = smallNum((await this.vusd.balanceOf(bob)).toString())

        assert.isBelow(vusdBob0-vusdBob1, 3020)
        assert.isAbove(vusdBob0-vusdBob1, 3000)

        ethPool = await this.pool.pools(this.weth.address)
        const ethPrice1 = smallNum(ethPool.price.toString())
        console.log('ETH price', ethPrice1)
        assert.isBelow(ethPrice0, ethPrice1)
        
    });

    it('should remove liquidity successfully', async () => {

        const deadline = (await time.latest()) + 10000

        await this.pool.swapExactTokenForToken(
            this.dai.address, this.weth.address, 
            bigNum(15000), bigNum(45), bob, deadline,
            {from: bob})

        const liquidity = (await this.pool.balanceOf(alice, 0)).toString()

        console.log('liquidity', liquidity);

        const results = await this.pool.removeLiquidity(
            this.weth.address, liquidity, alice, 0, 0, {from: alice});

        let vusdAmount = await this.vusd.balanceOf(alice)

        assert.isBelow(smallNum(vusdAmount.toString()), 50*300)
        assert.isAbove(smallNum(vusdAmount.toString()), 50*250)

        let devFee = await this.vusd.balanceOf(dev)
        console.log(smallNum(devFee.toString()))
        
    });

    it('should add and remove liquidity successfully', async () => {

        const deadline = (await time.latest()) + 10000

        await this.pool.swapExactTokenForToken(
            this.dai.address, this.weth.address, 
            bigNum(15000), bigNum(45), bob, deadline,
            {from: bob})

        await this.pool.addLiquidity(this.weth.address, 
            bigNum(1000000), bob, {from: bob});

        const liquidity = (await this.pool.balanceOf(alice, 0)).toString()

        console.log('liquidity', liquidity);

        const results = await this.pool.removeLiquidity(
            this.weth.address, liquidity, alice, 0, 0, {from: alice});

        let vusdAmount = await this.vusd.balanceOf(alice)

        assert.isBelow(smallNum(vusdAmount.toString()), 50*300/2)
        assert.isAbove(smallNum(vusdAmount.toString()), 50*250/2)

        let devFee = await this.vusd.balanceOf(dev)
        console.log(smallNum(devFee.toString()))
        
    });

    it('should list new tokens successfully', async () => {

        const deadline = (await time.latest()) + 10000

        await this.pool.listNewToken(
            this.yfi.address, bigNum(20000), 
            0, bigNum(20), bob, {from: bob})

        const yfiAlice0 = smallNum((await this.yfi.balanceOf(alice)).toString())
        const daiAlice0 = smallNum((await this.dai.balanceOf(alice)).toString())

        let yfiPool = await this.pool.pools(this.yfi.address)
        const yfiPrice0 = smallNum(yfiPool.price.toString())

        await this.pool.swapTokenForExactToken(
            this.dai.address, this.yfi.address, 
            bigNum(30000), bigNum(1), alice, deadline,
            {from: alice})

        const yfiAlice1 = smallNum((await this.yfi.balanceOf(alice)).toString())
        const daiAlice1 = smallNum((await this.dai.balanceOf(alice)).toString())
        assert.equal(yfiAlice1-yfiAlice0, 1)
        assert.isBelow(daiAlice0-daiAlice1, 22000)
        assert.isAbove(daiAlice0-daiAlice1, 20000)

        yfiPool = await this.pool.pools(this.yfi.address)
        const yfiPrice1 = smallNum(yfiPool.price.toString())

        assert.isAbove(yfiPrice1, yfiPrice0)
        console.log('yfi', yfiPrice1, yfiPrice0)
        
    });

});