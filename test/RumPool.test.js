const { expectRevert, time } = require('@openzeppelin/test-helpers');
const RumPool = artifacts.require('RumPool');
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

        await this.weth.transfer(alice, bigNum(1000000), {from: minter})
        await this.yfi.transfer(alice, bigNum(1000000), {from: minter})
        await this.dai.transfer(alice, bigNum(1000000), {from: minter})

        await this.weth.transfer(bob, bigNum(1000000), {from: minter})
        await this.yfi.transfer(bob, bigNum(1000000), {from: minter})
        await this.dai.transfer(bob, bigNum(1000000), {from: minter})

        this.pool = await RumPool.new(this.vusd.address, {from: minter})
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

        await this.pool.addLiquidity(this.weth.address, bigNum(1000000), {from: alice});
        await this.pool.addLiquidity(this.dai.address, bigNum(1000000), {from: alice});
    })


    it('should add liquidity successfully', async () => {

        const ethPool = await this.pool.pools(this.weth.address);
        assert.equal(ethPool.price.toString(), bigNum(300))
        
    });

    it('should purchase and sell ERC-20 successfully', async () => {

        await this.pool.swap(this.weth.address, this.dai.address, bigNum(2), bigNum(400), {from: bob})

        const daiAmount = await this.dai.balanceOf(bob)

        const ethPool = await this.pool.pools(this.weth.address);

        const daiPool = await this.pool.pools(this.dai.address);

        assert.isBelow(smallNum(daiAmount.toString())-1000000, 600)
        assert.isAbove(smallNum(daiAmount.toString())-1000000, 550)

        assert.isAbove(smallNum(daiPool.price.toString()), 1)
        assert.isBelow(smallNum(daiPool.price.toString()), 2)

        assert.isAbove(smallNum(ethPool.price.toString()), 200)
        assert.isBelow(smallNum(ethPool.price.toString()), 300)
        
    });

    it('should purchase and sell vUSD successfully', async () => {

        await this.pool.swap(this.weth.address, this.vusd.address, bigNum(2), bigNum(400), {from: bob})

        let vusdAmount = await this.vusd.balanceOf(bob)

        assert.isBelow(smallNum(vusdAmount.toString()), 600)
        assert.isAbove(smallNum(vusdAmount.toString()), 550)

        const ethPool = await this.pool.pools(this.weth.address);

        assert.isAbove(smallNum(ethPool.price.toString()), 200)
        assert.isBelow(smallNum(ethPool.price.toString()), 300)

        await this.pool.swap(this.vusd.address, this.weth.address, bigNum(350), bigNum(1), {from: bob})

        vusdAmount = await this.vusd.balanceOf(bob)

        assert.isBelow(smallNum(vusdAmount.toString()), 250)
        assert.isAbove(smallNum(vusdAmount.toString()), 200)
        
    });

    it('should remove liquidity successfully', async () => {

        await this.pool.swap(this.dai.address, this.weth.address, bigNum(15000), bigNum(45), {from: bob})

        const liquidity = (await this.pool.balanceOf(alice, 0)).toString()

        console.log('liquidity', liquidity);

        const results = await this.pool.removeLiquidity(this.weth.address, liquidity, 0, 0, {from: alice});

        let vusdAmount = await this.vusd.balanceOf(alice)

        assert.isBelow(smallNum(vusdAmount.toString()), 50*300)
        assert.isAbove(smallNum(vusdAmount.toString()), 50*250)

        let devFee = await this.vusd.balanceOf(dev)
        console.log(smallNum(devFee.toString()))
        
    });

});