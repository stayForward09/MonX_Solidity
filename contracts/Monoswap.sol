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
 * The Monoswap is ERC1155 contract does this and that...
 */
contract Monoswap is ERC1155, Ownable {
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
    uint256 pid;
    uint256 lastPoolValue;
    address token;
    PoolStatus status;
    uint112 vusdDebt;
    uint112 vusdCredit;
    uint112 tokenBalance;
    uint112 price; // over 1e18
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
  mapping (address => uint8) private tokenStatus; //0=unlocked, 1=locked, 2=exempt
  mapping (address => uint8) public tokenPoolStatus; //0=undefined, 1=exists

  uint256 public poolSize=0;

  uint private unlocked = 1;
  modifier lock() {
    require(unlocked == 1, 'Monoswap: LOCKED');
    unlocked = 0;
    _;
    unlocked = 1;
  }

  modifier lockToken(address _token) { 
    uint8 originalState = tokenStatus[_token];
    require(originalState!=1, 'Monoswap: POOL LOCKED');
    if(originalState==0) {
      tokenStatus[_token] = 1;
    }
    _;
    if(originalState==0) {
      tokenStatus[_token] = 0;
    }
  }

  modifier ensure(uint deadline) {
    require(deadline >= block.timestamp, 'Monoswap: EXPIRED');
    _;
  }  

  event AddLiquidity(address indexed provider, 
    uint indexed pid,
    address indexed token,
    uint liquidityAmount,
    uint vusdAmount, uint tokenAmount);

  event RemoveLiquidity(address indexed provider, 
    uint indexed pid,
    address indexed token,
    uint liquidityAmount,
    uint vusdAmount, uint tokenAmount);

  event Swap(
    address indexed user,
    address indexed tokenIn,
    address indexed tokenOut,
    uint amountIn,
    uint amountOut
  );
  
  constructor(IvUSD _vusd) public ERC1155("{1}") {
    vUSD = _vusd;
  }

  function setFeeTo (address _feeTo) onlyOwner external {
    feeTo = _feeTo;
  }
  
  function setFees (uint16 _fees) onlyOwner external {
    require(_fees<1e3, "fees too large");
    fees = _fees;
  }

  function setDevFee (uint16 _devFee) onlyOwner external {
    require(_devFee<1e3, "devFee too large");
    devFee = _devFee;
  }

  function mint (address account, uint256 id, uint256 amount) internal {
    totalSupply[id]=totalSupply[id].add(amount);
    _mint(account, id, amount, "");
  }

  function burn (address account, uint256 id, uint256 amount) internal {
    totalSupply[id]=totalSupply[id].sub(amount);
    _burn(account, id, amount);
  }

  function _createPool (address _token, uint112 _price, PoolStatus _status) lock internal returns(uint256 _pid)  {
    require(tokenPoolStatus[_token]==0, "Monoswap: Token Exists");
    require (_token != address(vUSD), "Monoswap: vUSD pool not allowed");
    _pid = poolSize;
    pools[_token] = PoolInfo({
      token: _token,
      pid: _pid,
      vusdCredit: 0,
      vusdDebt: 0,
      tokenBalance: 0,
      lastPoolValue: 0,
      status: _status,
      price: _price
    });

    poolSize = _pid.add(1);
    tokenPoolStatus[_token]=1;
  }

  function addOfficialToken (address _token, uint112 _price) onlyOwner external returns(uint256 _pid)  {
    _pid = _createPool(_token, _price, PoolStatus.OFFICIAL);
  }

  function _mintFee (uint256 pid, uint256 lastPoolValue, uint256 newPoolValue) internal {
    uint256 _totalSupply = totalSupply[pid];
    if(newPoolValue>lastPoolValue && lastPoolValue>0) {
      uint256 deltaPoolValue = newPoolValue - lastPoolValue; 
      uint256 devLiquidity = _totalSupply.mul(deltaPoolValue).mul(devFee).div(newPoolValue-deltaPoolValue)/1e5;
      mint(feeTo, pid, devLiquidity);
    }

  }

  function getPool (address _token) view public returns (uint256 poolValue, 
    uint256 tokenBalanceVusdValue, uint256 vusdCredit, uint256 vusdDebt) {
    PoolInfo memory pool = pools[_token];
    vusdCredit = pool.vusdCredit;
    vusdDebt = pool.vusdDebt;
    tokenBalanceVusdValue = uint(pool.price).mul(pool.tokenBalance)/1e18;

    poolValue = tokenBalanceVusdValue.add(vusdCredit).sub(vusdDebt);
  }

  function listNewToken (address _token, uint112 _price, 
    uint256 vusdAmount, 
    uint256 tokenAmount,
    address to) public returns(uint _pid, uint256 liquidity) {
    _pid = _createPool(_token, _price, PoolStatus.LISTED);
    liquidity = addLiquidityPair(_token, vusdAmount, tokenAmount, to);
  }

  function addLiquidityPair (address _token, 
    uint256 vusdAmount, 
    uint256 tokenAmount,
    address to) public returns(uint256 liquidity) {
    require (tokenAmount>0, "Monoswap: Bad Amount");

    require(tokenPoolStatus[_token]==1, "Monoswap: No pool");

    // if(tokenPoolStatus[_token]!=1 && vusdAmount > 0 && tokenAmount > 0) {
    //   // vusd back determines token price
    //   uint256 initialPrice = vusdAmount.mul(1e18).div(tokenAmount);
    //   _createPool(_token, initialPrice, PoolStatus.LISTED);
    // }
    (uint256 poolValue, , ,) = getPool(_token);
    PoolInfo memory pool = pools[_token];

    // require (pool.status==PoolStatus.OFFICIAL || vusdAmount>0, 
    //   "Monoswap: vUSD Required for unofficial pools");
    
    _mintFee(pool.pid, pool.lastPoolValue, poolValue);
    uint256 _totalSupply = totalSupply[pool.pid];
    IERC20(_token).safeTransferFrom(to, address(this), tokenAmount);
    if(vusdAmount>0){
      vUSD.safeTransferFrom(to, address(this), vusdAmount);
    }

    uint256 liquidityVusdValue = vusdAmount.add(tokenAmount.mul(pool.price)/1e18);

    if(_totalSupply==0){
      liquidity = liquidityVusdValue.sub(MINIMUM_LIQUIDITY);
    }else{
      liquidity = _totalSupply.mul(liquidityVusdValue).div(poolValue);
    }

    mint(to, pool.pid, liquidity);
    _syncPoolInfo(_token, vusdAmount, 0);

    emit AddLiquidity(to, 
    pool.pid,
    _token,
    liquidity, 
    vusdAmount, tokenAmount);
  }
  

  function addLiquidity (address _token, uint256 _amount, address to) external returns(uint256 liquidity)  {
    liquidity = addLiquidityPair(_token, 0, _amount, to);
  }  

  // this function requires others to do the input validation
  function _syncPoolInfo (address _token, uint256 vusdIn, uint256 vusdOut) lockToken(_token) internal returns(uint256 poolValue, 
    uint256 tokenBalanceVusdValue, uint256 vusdCredit, uint256 vusdDebt) {
    // PoolInfo memory pool = pools[_token];
    uint256 tokenPoolPrice = pools[_token].price;
    (vusdCredit, vusdDebt) = _updateVusdBalance(_token, vusdIn, vusdOut);

    uint256 tokenReserve = IERC20(_token).balanceOf(address(this));
    tokenBalanceVusdValue = tokenPoolPrice.mul(tokenReserve)/1e18;

    pools[_token].tokenBalance = uint112(tokenReserve);
    poolValue = tokenBalanceVusdValue.add(vusdCredit).sub(vusdDebt);
    pools[_token].lastPoolValue = poolValue;
  }
  
  function _removeLiquidity (address _token, uint256 liquidity,
    address to) view public returns(
    uint256 poolValue, uint256 liquidityIn, uint256 vusdOut, uint256 tokenOut) {
    
    require (liquidity>0, "Monoswap: Bad Amount");
    uint256 tokenBalanceVusdValue;
    uint256 vusdCredit;
    uint256 vusdDebt;
    PoolInfo memory pool = pools[_token];
    (poolValue, tokenBalanceVusdValue, vusdCredit, vusdDebt) = getPool(_token);
    uint256 _totalSupply = totalSupply[pool.pid];
    liquidityIn = Math.min(balanceOf(to, pool.pid), liquidity);
    uint256 tokenReserve = IERC20(_token).balanceOf(address(this));
    
    if(tokenReserve < pool.tokenBalance){
      tokenBalanceVusdValue = tokenReserve.mul(pool.price)/1e18;
    }

    if(vusdDebt>0){
      tokenReserve = (tokenBalanceVusdValue.sub(vusdDebt)).mul(1e18).div(pool.price);
    }

    // if vusdCredit==0, vusdOut will be 0 as well
    vusdOut = liquidityIn.mul(vusdCredit).div(_totalSupply);

    tokenOut = liquidityIn.mul(tokenReserve).div(_totalSupply);

  }
  
  
  function removeLiquidity (address _token, uint256 liquidity, address to, 
    uint256 minVusdOut, 
    uint256 minTokenOut) external returns(uint256 vusdOut, uint256 tokenOut)  {
    require (tokenPoolStatus[_token]==1, "Monoswap: Token Not Found");
    PoolInfo memory pool = pools[_token];
    uint256 poolValue;
    uint256 liquidityIn;
    (poolValue, liquidityIn, vusdOut, tokenOut) = _removeLiquidity(_token, liquidity, to);

    _mintFee(pool.pid, pool.lastPoolValue, poolValue);
    require (vusdOut>=minVusdOut, "Monoswap: Less vUSD than desired");
    require (tokenOut>=minTokenOut, "Monoswap: Less token amount than desired");

    if (vusdOut>0){
      vUSD.mint(to, vusdOut);
    }

    IERC20(_token).safeTransfer(to, tokenOut);

    burn(to, pool.pid, liquidityIn);

    _syncPoolInfo(_token, 0, vusdOut);

    emit RemoveLiquidity(to, 
      pool.pid,
      _token,
      liquidityIn, 
      vusdOut, tokenOut);
    
  }

  function _getNewPrice (uint256 originalPrice, uint256 reserve, 
    uint256 delta, TxType txType) pure internal returns(uint256 price) {
    if(txType==TxType.SELL) {
      // no risk of being div by 0
      price = originalPrice.mul(reserve)/(reserve.add(delta));
    }else{ // BUY
      price = originalPrice.mul(reserve).div(reserve.sub(delta));
    }
  }

  // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
  function getAmountOut(address tokenIn, address tokenOut, 
    uint256 amountIn) public view returns (uint256 tokenInPrice, uint256 tokenOutPrice, 
    uint256 amountOut, uint256 tradeVusdValue) {
    require(amountIn > 0, 'Monoswap: INSUFFICIENT_INPUT_AMOUNT');
    
    uint256 amountInWithFee = amountIn.mul(1e5-fees)/1e5;
    address vusdAddress = address(vUSD);

    if(tokenIn==vusdAddress){
      tradeVusdValue = amountInWithFee;
      tokenInPrice = 1e18;
    }else{
      require (tokenPoolStatus[tokenIn]==1, "Monoswap: Token Not Found");
      // PoolInfo memory tokenInPool = pools[tokenIn];
      PoolStatus tokenInPoolStatus = pools[tokenIn].status;
      uint tokenInPoolPrice = pools[tokenIn].price;
      uint tokenInPoolTokenBalance = pools[tokenIn].tokenBalance;

      require (tokenInPoolStatus != PoolStatus.UNLISTED, "Monoswap: Pool Unlisted");
      
      tokenInPrice = _getNewPrice(tokenInPoolPrice, tokenInPoolTokenBalance, 
        amountInWithFee, TxType.SELL);
      tradeVusdValue = tokenInPrice.mul(amountInWithFee)/1e18;
    }

    if(tokenOut==vusdAddress){
      amountOut = tradeVusdValue;
      tokenOutPrice = 1e18;
    }else{
      require (tokenPoolStatus[tokenOut]==1, "Monoswap: Token Not Found");
      // PoolInfo memory tokenOutPool = pools[tokenOut];
      PoolStatus tokenOutPoolStatus = pools[tokenOut].status;
      uint tokenOutPoolPrice = pools[tokenOut].price;
      uint tokenOutPoolTokenBalance = pools[tokenOut].tokenBalance;

      require (tokenOutPoolStatus != PoolStatus.UNLISTED, "Monoswap: Pool Unlisted");
      uint256 preliminaryAmountOut = tradeVusdValue.mul(1e18).div(tokenOutPoolPrice);
      tokenOutPrice = _getNewPrice(tokenOutPoolPrice, tokenOutPoolTokenBalance, 
        preliminaryAmountOut, TxType.BUY);

      amountOut = tradeVusdValue.mul(1e18).div(tokenOutPrice);
    }
  }

  function getAmountIn(address tokenIn, address tokenOut, 
    uint256 amountOut) public view returns (uint256 tokenInPrice, uint256 tokenOutPrice, 
    uint256 amountIn, uint256 tradeVusdValue) {
    require(amountOut > 0, 'Monoswap: INSUFFICIENT_INPUT_AMOUNT');
    
    uint256 amountOutWithFee = amountOut.mul(1e5+fees)/1e5;
    address vusdAddress = address(vUSD);

    if(tokenOut==vusdAddress){
      tradeVusdValue = amountOutWithFee;
      tokenOutPrice = 1e18;
    }else{
      require (tokenPoolStatus[tokenOut]==1, "Monoswap: Token Not Found");
      // PoolInfo memory tokenOutPool = pools[tokenOut];
      PoolStatus tokenOutPoolStatus = pools[tokenOut].status;
      uint tokenOutPoolPrice = pools[tokenOut].price;
      uint tokenOutPoolTokenBalance = pools[tokenOut].tokenBalance;
      require (tokenOutPoolStatus != PoolStatus.UNLISTED, "Monoswap: Pool Unlisted");
      tokenOutPrice = _getNewPrice(tokenOutPoolPrice, tokenOutPoolTokenBalance, 
        amountOutWithFee, TxType.BUY);

      tradeVusdValue = tokenOutPrice.mul(amountOutWithFee)/1e18;
    }

    if(tokenIn==vusdAddress){
      amountIn = tradeVusdValue;
      tokenInPrice = 1e18;
    }else{
      require (tokenPoolStatus[tokenIn]==1, "Monoswap: Token Not Found");
      // PoolInfo memory tokenInPool = pools[tokenIn];
      PoolStatus tokenInPoolStatus = pools[tokenIn].status;
      uint tokenInPoolPrice = pools[tokenIn].price;
      uint tokenInPoolTokenBalance = pools[tokenIn].tokenBalance;
      require (tokenInPoolStatus != PoolStatus.UNLISTED, "Monoswap: Pool Unlisted");
      
      uint256 preliminaryAmountIn = tradeVusdValue.mul(1e18).div(tokenInPoolPrice);
      tokenInPrice = _getNewPrice(tokenInPoolPrice, tokenInPoolTokenBalance, 
        preliminaryAmountIn, TxType.SELL);
      amountIn = tradeVusdValue.mul(1e18).div(tokenInPrice);
    }
  }

  function swapExactTokenForToken(
    address tokenIn,
    address tokenOut,
    uint amountIn,
    uint amountOutMin,
    address to,
    uint deadline
  ) external virtual ensure(deadline) returns (uint amountOut) {
    amountOut = swapIn(tokenIn, tokenOut, to, amountIn);
    require(amountOut >= amountOutMin, 'Monoswap: INSUFFICIENT_OUTPUT_AMOUNT');
  }

  function swapTokenForExactToken(
    address tokenIn,
    address tokenOut,
    uint amountInMax,
    uint amountOut,
    address to,
    uint deadline
  ) external virtual ensure(deadline) returns (uint amountIn) {
    amountIn = swapOut(tokenIn, tokenOut, to, amountOut);
    require(amountIn <= amountInMax, 'Monoswap: EXCESSIVE_INPUT_AMOUNT');
  }

  function vusdBalanceAdd (uint256 _credit, uint256 _debt, 
    uint256 delta) public pure returns (uint256 _newCredit, uint256 _newDebt) {
    if(_debt>0){
      if(delta>_debt){
        _newDebt = 0;
        _newCredit = _credit.add(delta - _debt);
      }else{
        _newCredit = 0;
        _newDebt = _debt - delta;
      }
    }else{
      _newCredit = _credit.add(delta);
      _newDebt = 0;
    }
  }

  function vusdBalanceSub (uint256 _credit, uint256 _debt, 
    uint256 delta) public pure returns (uint256 _newCredit, uint256 _newDebt) {
    if(_credit>0){
      if(delta>_credit){
        _newCredit = 0;
        _newDebt = delta - _credit;
      }else{
        _newCredit = _credit - delta;
        _newDebt = 0;
      }
    }else{
      _newCredit = 0;
      _newDebt = _debt.add(delta);
    }
  } 

  function _updateVusdBalance (address _token, 
    uint _vusdIn, uint _vusdOut) internal returns (uint _vusdCredit, uint _vusdDebt) {
    if(_vusdIn>_vusdOut){
      _vusdIn = _vusdIn - _vusdOut;
      _vusdOut = 0;
    }else{
      _vusdOut = _vusdOut - _vusdIn;
      _vusdIn = 0;
    }

    // PoolInfo memory _pool = pools[_token];
    uint _poolVusdCredit = pools[_token].vusdCredit;
    uint _poolVusdDebt = pools[_token].vusdDebt;
    PoolStatus _poolStatus = pools[_token].status;
    
    if(_vusdOut>0){
      (_vusdCredit, _vusdDebt) = vusdBalanceSub(
        _poolVusdCredit, _poolVusdDebt, _vusdOut);
      pools[_token].vusdCredit = uint112(_vusdCredit);
      pools[_token].vusdDebt = uint112(_vusdDebt);
    }

    if(_vusdIn>0){
      (_vusdCredit, _vusdDebt) = vusdBalanceAdd(
        _poolVusdCredit, _poolVusdDebt, _vusdIn);
      pools[_token].vusdCredit = uint112(_vusdCredit);
      pools[_token].vusdDebt = uint112(_vusdDebt);
    }

    if(_poolStatus == PoolStatus.LISTED){

      require (_vusdCredit>=0 && _vusdDebt==0, "Monoswap: unofficial pool cannot bear debt");
    }
  }
  
  
  function _updateTokenInfo (address _token, uint256 _price,
      uint256 _vusdIn, uint256 _vusdOut) internal {
    
    pools[_token].price = uint112(_price);
    pools[_token].tokenBalance = uint112(IERC20(_token).balanceOf(address(this)));

    _updateVusdBalance(_token, _vusdIn, _vusdOut);
    
  }
  
  function swapOut (address tokenIn, address tokenOut, address to, 
      uint256 amountOut) public lockToken(tokenIn) returns(uint256 amountIn)  {

    IvUSD vusdLocal = vUSD;

    uint256 tokenInPrice;
    uint256 tokenOutPrice;
    uint256 tradeVusdValue;
    (tokenInPrice, tokenOutPrice, amountIn, tradeVusdValue) = getAmountIn(tokenIn, tokenOut, amountOut);

    if(tokenStatus[tokenIn]==2){
      IERC20(tokenIn).safeTransferFrom(to, address(this), amountIn);
    }else{
      uint256 balanceIn0 = IERC20(tokenIn).balanceOf(address(this));
      IERC20(tokenIn).safeTransferFrom(to, address(this), amountIn);
      uint256 balanceIn1 = IERC20(tokenIn).balanceOf(address(this));
      require(amountIn >= balanceIn1.sub(balanceIn0), "Monoswap: Not Enough Tokens");
    }

    uint256 halfFeesInTokenIn = amountIn.mul(fees)/2e5;

    uint256 oneSideFeesInVusd = tokenInPrice.mul(halfFeesInTokenIn)/1e18;

    // trading in
    if(tokenIn==address(vusdLocal)){
      vusdLocal.burn(address(this), amountIn);
      // all fees go to buy side
      oneSideFeesInVusd = oneSideFeesInVusd.mul(2);
    }else{
      _updateTokenInfo(tokenIn, tokenInPrice, 0, tradeVusdValue.add(oneSideFeesInVusd));
    }

    // trading out
    if(tokenOut==address(vusdLocal)){
      vusdLocal.mint(to, amountOut);
      // all fees go to sell side
      _updateVusdBalance(tokenIn, oneSideFeesInVusd, 0);
    }else{
      IERC20(tokenOut).safeTransfer(to, amountOut);
      _updateTokenInfo(tokenOut, tokenOutPrice, tradeVusdValue.add(oneSideFeesInVusd), 0);
    }

    emit Swap(to, tokenIn, tokenOut, amountIn, amountOut);
  }

  function swapIn (address tokenIn, address tokenOut, address to,
      uint256 amountIn) public lockToken(tokenIn) returns(uint256 amountOut)  {

    IvUSD vusdLocal = vUSD;

    if(tokenStatus[tokenIn]==2){
      IERC20(tokenIn).safeTransferFrom(to, address(this), amountIn);
    }else{
      uint256 balanceIn0 = IERC20(tokenIn).balanceOf(address(this));
      IERC20(tokenIn).safeTransferFrom(to, address(this), amountIn);
      uint256 balanceIn1 = IERC20(tokenIn).balanceOf(address(this));
      amountIn = balanceIn1.sub(balanceIn0);
    }

    uint256 halfFeesInTokenIn = amountIn.mul(fees)/2e5;

    uint256 tokenInPrice;
    uint256 tokenOutPrice;
    uint256 tradeVusdValue;
    (tokenInPrice, tokenOutPrice, amountOut, tradeVusdValue) = getAmountOut(tokenIn, tokenOut, amountIn);

    uint256 oneSideFeesInVusd = tokenInPrice.mul(halfFeesInTokenIn)/1e18;

    // trading in
    if(tokenIn==address(vusdLocal)){
      vusdLocal.burn(address(this), amountIn);
      // all fees go to the other side
      oneSideFeesInVusd = oneSideFeesInVusd.mul(2);
    }else{
      _updateTokenInfo(tokenIn, tokenInPrice, 0, tradeVusdValue.add(oneSideFeesInVusd));
    }

    // trading out
    if(tokenOut==address(vusdLocal)){
      vusdLocal.mint(to, amountOut);
    }else{
      IERC20(tokenOut).safeTransfer(to, amountOut);
      _updateTokenInfo(tokenOut, tokenOutPrice, tradeVusdValue.add(oneSideFeesInVusd), 0);
    }

    emit Swap(to, tokenIn, tokenOut, amountIn, amountOut);
    
    
  }
  
  
}