pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@nomiclabs/buidler/console.sol";

interface IvUSD is IERC20 {
  function mint (address account, uint256 amount) external;

  function burn (address account, uint256 amount) external;
}


/**
 * The RumPool is ERC1155 contract does this and that...
 */
contract RumPool is ERC1155, Ownable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using SafeERC20 for IvUSD;

  IvUSD vUSD;
  address feeTo;
  uint16 fees=300; // over 1e5, so 300 means 0.3%
  uint16 devFee = 50; // over 1e5, so 50 means 0.05%

  mapping (uint256 => uint256) public totalSupply;
  uint256 MINIMUM_LIQUIDITY=1e3;

  struct PoolInfo {
    address token;
    uint256 pid;
    uint256 vusdDebt;
    uint256 vusdCredit;
    uint256 tokenBalance;
    uint256 lastPoolValue;
    bool unlocked;
    bool isActive;
    PoolStatus status;
    uint256 price; // over 1e18
  }

  enum TxType {
    SELL,
    BUY
  }

  enum PoolStatus {
    UNLISTED,
    LISTED,
    OFFICIAL
  }
  
  mapping (address => PoolInfo) public pools;
  uint256 public poolSize=0;

  uint private unlocked = 1;
  modifier lock() {
    require(unlocked == 1, 'RumPool: LOCKED');
    unlocked = 0;
    _;
    unlocked = 1;
  }

  modifier lockPool(address token) { 
    require (pools[token].isActive, "RumPool: Token Not Found");
    require(pools[token].unlocked, 'RumPool: POOL LOCKED');
    pools[token].unlocked = false;
    _;
    pools[token].unlocked = true;
  }
  
  
  constructor(IvUSD _vusd) public ERC1155("{1}") {
    vUSD = _vusd;
  }

  function setFeeTo (address _feeTo) onlyOwner external {
    feeTo = _feeTo;
  }
  

  function mint (address account, uint256 id, uint256 amount) internal {
    totalSupply[id]=totalSupply[id].add(amount);
    _mint(account, id, amount, "");
  }

  function burn (address account, uint256 id, uint256 amount) internal {
    totalSupply[id]=totalSupply[id].sub(amount);
    _burn(account, id, amount);
  }

  function _addToken (address _token, uint256 _price, PoolStatus _status) lock internal returns(uint256 _pid)  {
    require(!pools[_token].isActive, "RumPool: Token Exists");
    _pid = poolSize;
    pools[_token] = PoolInfo({
      token: _token,
      pid: _pid,
      vusdCredit: 0,
      vusdDebt: 0,
      tokenBalance: 0,
      lastPoolValue: 0,
      status: _status,
      isActive: true,
      price: _price,
      unlocked: true
    });

    poolSize++;
  }

  function addOfficialToken (address _token, uint256 _price) onlyOwner external returns(uint256 _pid)  {
    _addToken(_token, _price, PoolStatus.OFFICIAL);
  }

  function _mintFee (uint256 pid, uint256 lastPoolValue, uint256 newPoolValue) internal {
    uint256 lastPoolValue = lastPoolValue;
    uint256 _totalSupply = totalSupply[pid];
    if(newPoolValue>lastPoolValue && lastPoolValue>0) {
      uint256 deltaPoolValue = newPoolValue - lastPoolValue; 
      uint256 devLiquidity = _totalSupply.mul(deltaPoolValue).mul(devFee).div(newPoolValue-deltaPoolValue)/1e5;
      mint(feeTo, pid, devLiquidity);
    }

  }
  

  function getPool (address _token) view public returns (uint256 poolValue, 
    uint256 tokenBalanceVusdValue, uint256 vusdCredit, uint256 vusdDebt) {
    require (pools[_token].isActive, "RumPool: Token Not Found");
    PoolInfo memory pool = pools[_token];
    vusdCredit = pool.vusdCredit;
    vusdDebt = pool.vusdDebt;
    tokenBalanceVusdValue = pool.price.mul(pool.tokenBalance)/1e18;

    poolValue = tokenBalanceVusdValue.add(vusdCredit).sub(vusdDebt);
  }

  function addLiquidityPair (address _token, uint256 vusdAmount, uint256 tokenAmount) public returns(uint256 liquidity) {
    require (tokenAmount>0, "RumPool: Bad Amount");
    require (_token != address(vUSD), "RumPool: vUSD pool not allowed");

    address provider = msg.sender;
    if(!pools[_token].isActive && vusdAmount > 0 && tokenAmount > 0) {
      // vusd back determines token price
      uint256 initialPrice = vusdAmount.mul(1e18).div(tokenAmount);
      _addToken(_token, initialPrice, PoolStatus.LISTED);
    }
    (uint256 poolValue, , ,) = getPool(_token);
    PoolInfo memory pool = pools[_token];

    require (pool.status==PoolStatus.OFFICIAL || vusdAmount>0, "RumPool: vUSD Required for unofficial pools");
    
    _mintFee(pool.pid, pool.lastPoolValue, poolValue);
    uint256 _totalSupply = totalSupply[pool.pid];
    IERC20(_token).safeTransferFrom(provider, address(this), tokenAmount);
    if(vusdAmount>0){
      vUSD.safeTransferFrom(provider, address(this), vusdAmount);
    }

    uint256 liquidityVusdValue = vusdAmount + pool.price.mul(tokenAmount)/1e18;

    if(_totalSupply==0){
      liquidity = liquidityVusdValue.sub(MINIMUM_LIQUIDITY);
    }else{
      liquidity = _totalSupply.mul(liquidityVusdValue).div(poolValue);
    }

    mint(provider, pool.pid, liquidity);
    _syncPoolInfo(_token, vusdAmount, 0);
  }
  

  function addLiquidity (address _token, uint256 _amount) external returns(uint256 liquidity)  {
    addLiquidityPair(_token, 0, _amount);
  }  

  // this function requires others to do the input validation
  function _syncPoolInfo (address _token, uint256 vusdIn, uint256 vusdOut) lockPool(_token) internal returns(uint256 poolValue, 
    uint256 tokenBalanceVusdValue, uint256 vusdCredit, uint256 vusdDebt) {
    PoolInfo memory pool = pools[_token];
    if(vusdIn>=vusdOut){
      uint256 deltaIn = vusdIn - vusdOut;
      vusdCredit = pool.vusdCredit.add(deltaIn);
      vusdDebt = pool.vusdDebt;
    }else{
      uint256 deltaOut = vusdOut- vusdIn;
      vusdCredit = pool.vusdCredit;
      vusdDebt = pool.vusdDebt.add(deltaOut);
    }

    uint256 tokenReserve = IERC20(_token).balanceOf(address(this));
    tokenBalanceVusdValue = pool.price.mul(tokenReserve)/1e18;
    if(vusdDebt > 0){
      if (vusdDebt <= vusdCredit){
        // safe
        vusdCredit = vusdCredit - vusdDebt;
        vusdDebt = 0;
      }else{
        // safe
        vusdDebt = vusdDebt - vusdCredit;
        vusdCredit = 0;
      }
      pool.vusdCredit = vusdCredit;
      pool.vusdDebt = vusdDebt;
      
    }

    if(pool.status == PoolStatus.LISTED){

      require (vusdCredit>0 && vusdDebt==0, "RumPool: unofficial pool cannot bear debt");
      
      pool.price = vusdCredit.mul(1e18).div(tokenReserve);
    }

    pool.tokenBalance = tokenReserve;
    pool.lastPoolValue = tokenBalanceVusdValue.add(vusdCredit).sub(vusdDebt);
    pools[_token] = pool;
  }
  
  function _removeLiquidity (address _token, uint256 liquidity) view public returns(uint256 poolValue, uint256 liquidityIn, uint256 vusdOut, uint256 tokenOut) {
    
    require (liquidity>0, "RumPool: Bad Amount");
    uint256 tokenBalanceVusdValue;
    uint256 vusdCredit;
    uint256 vusdDebt;
    PoolInfo memory pool = pools[_token];
    (poolValue, tokenBalanceVusdValue, vusdCredit, vusdDebt) = getPool(_token);
    uint256 _totalSupply = totalSupply[pool.pid];
    liquidityIn = Math.min(balanceOf(msg.sender, pool.pid), liquidity);
    uint256 tokenReserve = IERC20(_token).balanceOf(address(this));

    console.log(vusdCredit, vusdDebt);
    console.log(poolValue, tokenBalanceVusdValue);
    
    if(tokenReserve < pool.tokenBalance){
      tokenBalanceVusdValue = tokenReserve.mul(pool.price)/1e18;
    }

    if(vusdDebt>0){
      tokenReserve = (tokenBalanceVusdValue - vusdDebt).mul(1e18).div(pool.price);
    }

    // if vusdCredit==0, vusdOut will be 0 as well
    vusdOut = liquidityIn.mul(vusdCredit).div(_totalSupply);

    tokenOut = liquidityIn.mul(tokenReserve).div(_totalSupply);

  }
  
  
  function removeLiquidity (address _token, uint256 liquidity, uint256 minVusdOut, uint256 minTokenOut) external returns(uint256 vusdOut, uint256 tokenOut)  {
    PoolInfo memory pool = pools[_token];
    uint256 poolValue;
    uint256 liquidityIn;
    (poolValue, liquidityIn, vusdOut, tokenOut) = _removeLiquidity(_token, liquidity);

    console.log(poolValue, liquidityIn, vusdOut, tokenOut);

    _mintFee(pool.pid, pool.lastPoolValue, poolValue);
    require (vusdOut>=minVusdOut, "RumPool: Less vUSD than desired");
    require (tokenOut>=minTokenOut, "RumPool: Less token amount than desired");
    address _provider = msg.sender;
    if (vusdOut>0){
      vUSD.mint(_provider, vusdOut);
    }

    IERC20(_token).safeTransfer(_provider, tokenOut);

    _syncPoolInfo(_token, 0, vusdOut);
    
  }

  function newPrice (uint256 originalPrice, uint256 reserve, uint256 delta, TxType txType) pure internal returns(uint256 price) {
    if(txType==TxType.SELL) {
      // no risk of being div by 0
      price = originalPrice.mul(reserve)/(reserve.add(delta));
    }else{ // BUY
      price = originalPrice.mul(reserve).div(reserve.sub(delta));
    }
  }
  
  
  function swapQuote (address tokenIn, address tokenOut, uint256 amountIn) view public returns(uint256 tokenInPrice, uint256 tokenOutPrice, uint256 amountOut)  {

    require (amountIn>0, "RumPool: Bad Amount In");
    uint256 tokenInVusdValue = 0;
    if(tokenIn==address(vUSD)){
      tokenInVusdValue = amountIn;
      tokenInPrice = 1e18;
    }else{
      require (pools[tokenIn].isActive, "RumPool: Token Not Found");
      PoolInfo memory tokenInPool = pools[tokenIn];

      require (tokenInPool.status != PoolStatus.UNLISTED, "RumPool: Pool Unlisted");
      
      tokenInPrice = newPrice(tokenInPool.price, tokenInPool.tokenBalance, amountIn, TxType.SELL);
      tokenInVusdValue = tokenInPrice.mul(amountIn)/1e18;
    }
    
    if(tokenOut==address(vUSD)){
      amountOut = tokenInVusdValue;
      tokenOutPrice = 1e18;
    }else{
      require (pools[tokenOut].isActive, "RumPool: Token Not Found");
      PoolInfo memory tokenOutPool = pools[tokenOut];
      require (tokenOutPool.status != PoolStatus.UNLISTED, "RumPool: Pool Unlisted");
      uint256 preliminaryAmountOut = tokenInVusdValue.mul(1e18).div(tokenOutPool.price);
      tokenOutPrice = newPrice(tokenOutPool.price, tokenOutPool.tokenBalance, preliminaryAmountOut, TxType.BUY);

      amountOut = tokenInVusdValue.mul(1e18).div(tokenOutPrice);
    }
  }

  function swap (address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) external returns(uint256 amountOut)  {
    uint256 amountInAfterFees = amountIn.mul(1e5-fees)/1e5;
    uint256 halfFeesInTokenIn = amountIn.mul(fees)/2e5;

    uint256 tokenInPrice;
    uint256 tokenOutPrice;
    (tokenInPrice, tokenOutPrice, amountOut) = swapQuote(tokenIn, tokenOut, amountInAfterFees);
    
    require (amountOut>=minAmountOut, "RumPool: Less token output than desired");

    address _customer = msg.sender;
    uint256 tradeVusdValue = tokenInPrice.mul(amountInAfterFees)/1e18;
    uint256 halfFeesInVusd = tokenInPrice.mul(halfFeesInTokenIn)/1e18;

    // trading in
    IERC20(tokenIn).safeTransferFrom(_customer, address(this), amountIn);
    if(tokenIn==address(vUSD)){
      vUSD.burn(address(this), amountIn);
    }else{
      PoolInfo memory tokenInPool = pools[tokenIn];
      tokenInPool.price = tokenInPrice;
      tokenInPool.tokenBalance = tokenInPool.tokenBalance.add(amountInAfterFees).add(halfFeesInTokenIn);
      tokenInPool.vusdDebt = tokenInPool.vusdDebt.add(tradeVusdValue);
      pools[tokenIn] = tokenInPool;
    }

    // tranding out
    if(tokenOut==address(vUSD)){
      vUSD.mint(_customer, amountOut);
    }else{
      PoolInfo memory tokenOutPool = pools[tokenOut];
      tokenOutPool.price = tokenOutPrice;
      tokenOutPool.tokenBalance = tokenOutPool.tokenBalance.sub(amountOut);
      tokenOutPool.vusdCredit = tokenOutPool.vusdCredit.add(tradeVusdValue).add(halfFeesInVusd);
      pools[tokenOut] = tokenOutPool;
      IERC20(tokenOut).safeTransfer(_customer, amountOut);
    }
    
    
  }
  
  
}
