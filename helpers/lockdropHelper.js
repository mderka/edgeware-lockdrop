const Promise = require('bluebird');
const { toBN } = require('web3').utils;
const bs58 = require('bs58');

function getLockPeriodAdditiveBonus(ethAmount, lockTime, lockStart) {
  const SECONDS_IN_HOUR = 3600;
  const HOURS_IN_DAY = 24;
  const DAYS_IN_MONTH = 31;
  const SECONDS_IN_MONTH = SECONDS_IN_HOUR * HOURS_IN_DAY * DAYS_IN_MONTH;

  // catch non-lock calls
  if (!lockTime || !lockStart) {
    return toBN(0);
  }

  // calculate the additive bonus for the period the lock occurred
  if (lockTime < lockStart + SECONDS_IN_MONTH) {
    return toBN(40);
  } else if (lockTime < lockStart + (SECONDS_IN_MONTH * 2)) {
    return toBN(30);
  } else if (lockTime < lockStart + (SECONDS_IN_MONTH * 3)) {
    return toBN(0);
  } else {
    return toBN(0);
  }
}

function getEffectiveValue(ethAmount, term, lockTime, lockStart) {
  let additiveBonus;
  // get additive bonus if calculating allocation of locks
  if (lockTime && lockStart) {
    additiveBonus = getLockPeriodAdditiveBonus(ethAmount, lockTime, lockStart);
  }

  if (term == '0') {
    // three month term yields no bonus
    return toBN(ethAmount).mul(toBN(100).add(additiveBonus)).div(toBN(100));
  } else if (term == '1') {
    // six month term yields 10% bonus
    return toBN(ethAmount).mul(toBN(110).add(additiveBonus)).div(toBN(100));
  } else if (term == '2') {
    // twelve month term yields 40% bonus
    return toBN(ethAmount).mul(toBN(140).add(additiveBonus)).div(toBN(100));
  } else if (term == 'signaling') {
    // 80% deduction
    return toBN(ethAmount).mul(toBN(20)).div(toBN(100));
  } else {
    // invalid term
    return toBN(0);
  }
}

const getLocks = async (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      owner: address,
    }
  });
};

const getSignals = async (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Signaled', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      contractAddr: address,
    }
  });
};

const getTotalLockedBalance = async (lockdropContract) => {
  const locks = await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  let totalAmountInETH = toBN(0);
  locks.forEach((event) => {
    const data = event.returnValues;
    totalAmountInETH = totalAmountInETH.add(toBN(data.eth));
  });

  return web3.utils.fromWei(totalAmountInETH.toString(), 'ether');
};

const calculateEffectiveLocks = async (lockdropContract) => {
  let totalETHLocked = toBN(0);
  const locks = {};
  const validatingLocks = {};

  const lockEvents = await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  const lockdropStartTime = (await lockdropContract.methods.LOCK_START_TIME().call());

  lockEvents.forEach((event) => {
    const data = event.returnValues;
    let value = getEffectiveValue(data.eth, data.term, data.time, lockdropStartTime);
    totalETHLocked = totalETHLocked.add(value);

    // Add all validators to a separate collection to do validator election over later
    if (data.isValidator) {
      if (data.edgewareKey in validatingLocks) {
        validatingLocks[data.edgewareKey] = {
          lockAmt: toBN(data.eth).add(toBN(validatingLocks[data.edgewareKey].lockAmt)).toString(),
          effectiveValue: toBN(validatingLocks[data.edgewareKey].effectiveValue).add(value).toString(),
          lockAddrs: [data.lockAddr, ...validatingLocks[data.edgewareKey].lockAddrs],
        };
      } else {
        validatingLocks[data.edgewareKey] = {
          lockAmt: toBN(data.eth).toString(),
          effectiveValue: value.toString(),
          lockAddrs: [data.lockAddr],
        };
      }
    }


    // Add all locks to collection, calculating/updating effective value of lock
    if (data.edgewareKey in locks) {
      locks[data.edgewareKey] = {
        lockAmt: toBN(data.eth).add(toBN(locks[data.edgewareKey].lockAmt)).toString(),
        effectiveValue: toBN(locks[data.edgewareKey].effectiveValue).add(value).toString(),
        lockAddrs: [data.lockAddr, ...locks[data.edgewareKey].lockAddrs],
      };
    } else {
      locks[data.edgewareKey] = {
        lockAmt: toBN(data.eth).toString(), 
        effectiveValue: value.toString(),
        lockAddrs: [data.lockAddr],
      };
    }
  });

  return { validatingLocks, locks, totalETHLocked };
};

const calculateEffectiveSignals = async (lockdropContract, blockNumber=null) => {
  let totalETHSignaled = toBN(0);
  let signals = {};

  const signalEvents = await lockdropContract.getPastEvents('Signaled', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  signalEvents.forEach(async (event) => {
    const data = event.returnValues;
    // Get balance at block that lockdrop ends
    let balance;
    if (blockNumber) {
      balance = await web3.eth.getBalance(data.contractAddr, blockNumber);
    } else {
      balance = await web3.eth.getBalance(data.contractAddr);
    }
    
    // Get value for each signal event and add it to the collection
    let value = getEffectiveValue(balance, 'signaling');
    totalETHSignaled = totalETHSignaled.add(value);

    if (data.edgewareKey in signals) {
      signals[data.edgewareKey] = {
        signalAmt: toBN(data.eth).add(toBN(signals[data.edgewareKey].signalAmt)).toString(),
        delayedEffectiveValue: toBN(signals[data.edgewareKey]
                                .delayedEffectiveValue)
                                .add(value.mul(toBN(75)).div(toBN(100)))
                                .toString(),
        immediateEffectiveValue: toBN(signals[data.edgewareKey]
                                  .immediateEffectiveValue)
                                  .add(value.mul(toBN(25)).div(toBN(100)))
                                  .toString(),
      };
    } else {
      signals[data.edgewareKey] = {
        signalAmt: toBN(data.eth).toString(),
        delayedEffectiveValue: value.mul(toBN(75)).div(toBN(100)).toString(),
        immediateEffectiveValue: value.mul(toBN(25)).div(toBN(100)).toString(),
      };
    }
  });

  return {  signals: signals, totalETHSignaled: totalETHSignaled }
}

const getLockStorage = async (lockAddress) => {
  return Promise.all([0,1].map(v => {
    return web3.eth.getStorageAt(lockAddress, v);
  }))
  .then(vals => {
    return {
      owner: vals[0],
      unlockTime: web3.utils.hexToNumber(vals[1]),
    };
  });
};

const selectEdgewareValidators = (validatingLocks, totalAllocation, totalETH, numOfValidators) => {
  const sortable = [];
  // Add the calculated edgeware balances with the respective key to a collection
  for (var key in validatingLocks) {
      sortable.push([
        `0x${key.slice(0, -4).slice(4)}`,
        toBN(validatingLocks[key].effectiveValue).mul(toBN(totalAllocation)).div(totalETH)
      ]);
  }

  // Sort and take the top "numOfValidators" from the collection
  return sortable
    .sort((a,b) => (a[1] > b[1]) ? 1 : ((b[1] > a[1]) ? -1 : 0))
    .slice(0, numOfValidators);
};

const getEdgewareBalanceObjects = (locks, signals, totalAllocation, totalETH) => {
  let balances = [];
  let vesting = [];
  for (var key in locks) {
    if (key in signals) {
      // if key also signaled ETH, add immediate effective signal value to the locked value
      const summation = toBN(locks[key].effectiveValue).add(signals[key].immediateEffectiveValue);
      balances.push([
        bs58.encode(new Buffer(key.slice(2), 'hex')),
        mulByAllocationFraction(summation, totalAllocation, totalETH),
      ]);
    } else {
      balances.push([
        bs58.encode(new Buffer(key.slice(2), 'hex')),
        mulByAllocationFraction(locks[key].effectiveValue, totalAllocation, totalETH).toString(),
      ]);
    }
  }

  for (var key in signals) {
    if (key in locks) {
      // if key locked, then we only need to create a vesting record as we created the balances record above
      vesting.push([
        bs58.encode(new Buffer(key.slice(2), 'hex')),
        mulByAllocationFraction(signals[key].delayedEffectiveValue, totalAllocation, totalETH).toString(),
        68400 * 365 // 1 year FIXME: see what vesting in substrate does
      ]);
    } else {
      // if key did not lock, then we need to create balances and vesting records
      // create balances record
      balances.push([
        bs58.encode(new Buffer(key.slice(2), 'hex')),
        mulByAllocationFraction(locks[key].immediateEffectiveValue, totalAllocation, totalETH).toString(),
      ]);
      // create vesting record
      vesting.push([
        bs58.encode(new Buffer(key.slice(2), 'hex')),
        mulByAllocationFraction(signals[key].delayedEffectiveValue, totalAllocation, totalETH).toString(),
        68400 * 365 // 1 year FIXME: see what vesting in substrate does
      ]);
    }
  }

  return { balances: balances, vesting: vesting };
};

const mulByAllocationFraction = (amount, totalAllocation, totalETH) => {
  return toBN(amount).mul(toBN(totalAllocation)).div(totalETH);
}

module.exports = {
  getLocks,
  getSignals,
  getTotalLockedBalance,
  calculateEffectiveLocks,
  calculateEffectiveSignals,
  getLockStorage,
  selectEdgewareValidators,
  getEdgewareBalanceObjects,
};
