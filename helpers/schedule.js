const { toBN, toWei } = require('web3').utils;

const JUNE_1ST_UTC = 1559347200;
const JUNE_16TH_UTC = 1560643200;
const JULY_1ST_UTC = 1561939200;
const JULY_16TH_UTC = 1563235200;
const JULY_31ST_UTC = 1564531200;
const AUG_15TH_UTC = 1565827200;
const AUG_30TH_UTC = 1567123200;

const BONUS_50 = toBN(50);
const BONUS_40 = toBN(40);
const BONUS_30 = toBN(30);
const BONUS_20 = toBN(20);
const BONUS_10 = toBN(10);

const getAdditiveBonus = (lockTime, lockStart, currentTotalETH) => {
  if (toBN(lockStart) != toBN(JUNE_1ST_UTC)) {
    return getFixtureAdditiveBonus(lockTime, lockStart);
  } else {
    if (toBN(lockTime) <= toBN(JUNE_16TH_UTC)) {
      return conditionalSwap(BONUS_50, currentTotalETH);
    } else if (toBN(lockTime) <= toBN(JULY_1ST_UTC)) {
      return conditionalSwap(BONUS_40, currentTotalETH);
    } else if (toBN(lockTime) <= toBN(JULY_16TH_UTC)) {
      return conditionalSwap(BONUS_30, currentTotalETH);
    } else if (toBN(lockTime) <= toBN(JULY_31ST_UTC)) {
      return conditionalSwap(BONUS_20, currentTotalETH);
    } else if (toBN(lockTime) <= toBN(AUG_15TH_UTC)) {
      return conditionalSwap(BONUS_10, currentTotalETH);
    } else if (toBN(lockTime) <= toBN(AUG_30TH_UTC)) {
      return toBN(0);
    } else {
      return toBN(0);
    }
  }
}

// FIXME: Ensure comparisons are correct which they ARE NOT
const conditionalSwap = (bonus, currentTotalETH) => {
  console.log(toWei('2200000', 'ether'), currentTotalETH.toString());
  let below200K = (toBN(currentTotalETH) < toBN(toWei('200000', 'ether')));
  console.log(`${toBN(currentTotalETH).toString()} < ${toBN(toWei('200000', 'ether')).toString()} = ${below200K}`);
  let below400K = (toBN(currentTotalETH) < toBN(toWei('400000', 'ether')));
  console.log(`${toBN(currentTotalETH).toString()} < ${toBN(toWei('400000', 'ether')).toString()} = ${below400K}`);
  let below700K = (toBN(currentTotalETH) < toBN(toWei('700000', 'ether')));
  console.log(`${toBN(currentTotalETH).toString()} < ${toBN(toWei('700000', 'ether')).toString()} = ${below700K}`);
  let below1100K = (toBN(currentTotalETH) < toBN(toWei('1100000', 'ether')));
  console.log(`${toBN(currentTotalETH).toString()} < ${toBN(toWei('1100000', 'ether')).toString()} = ${below1100K}`);
  let below1600K = (toBN(currentTotalETH) < toBN(toWei('1600000', 'ether')));
  console.log(`${toBN(currentTotalETH).toString()} < ${toBN(toWei('1600000', 'ether')).toString()} = ${below1600K}`);
  let below2200K = (toBN(currentTotalETH) < toBN(toWei('2200000', 'ether')));
  console.log(`${toBN(currentTotalETH).toString()} < ${toBN(toWei('2200000', 'ether')).toString()} = ${below2200K}`);
  // For each condition, we take the minimum of the two bonuses
  if (below200K) {
    return (bonus <= BONUS_50)
      ? bonus
      : BONUS_50;
  } else if (below400K) {
    return (bonus <= BONUS_40)
      ? bonus
      : BONUS_40;
  } else if (below700K) {
    return (bonus <= BONUS_30)
      ? bonus
      : BONUS_30;
  } else if (below1100K) {
    return (bonus <= BONUS_20)
      ? bonus
      : BONUS_20;
  } else if (below1600K) {
    return (bonus <= BONUS_10)
      ? bonus
      : BONUS_10;
  } else if (below2200K) {
    return toBN(0);
  } else {
    return toBN(0);
  }
}

const getFixtureAdditiveBonus = (lockTime, lockStart) => {
  const SECONDS_IN_HOUR = 3600;
  const HOURS_IN_DAY = 24;
  const DAYS_IN_MONTH = 31;
  const SECONDS_IN_MONTH = SECONDS_IN_HOUR * HOURS_IN_DAY * DAYS_IN_MONTH;

  // catch non-lock calls
  if (!lockTime || !lockStart) {
    return toBN(0);
  }

  // calculate the additive bonus for the period the lock occurred
  if (toBN(lockTime) < toBN(lockStart).add(toBN(SECONDS_IN_MONTH))) {
    return toBN(40);
  } else if (lockTime < lockStart + (SECONDS_IN_MONTH * 2)) {
    return toBN(30);
  } else if (lockTime < lockStart + (SECONDS_IN_MONTH * 3)) {
    return toBN(0);
  } else {
    return toBN(0);
  }
}

module.exports = {
  getAdditiveBonus,
}