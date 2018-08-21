const Mutex = require('await-semaphore').Mutex;
const IrcQuery = require('irc.js').Query;
const createAsyncMiddleware = require('json-rpc-engine/src/createAsyncMiddleware');
const createJsonRpcMiddleware = require('irc-json-rpc-middleware/scaffold');
const LogFilter = require('./log-filter.js');
const BlockFilter = require('./block-filter.js');
const TxFilter = require('./tx-filter.js');
const {intToHex, hexToInt} = require('./hexUtils');

module.exports = createIrcFilterMiddleware;

function createIrcFilterMiddleware({blockTracker, provider}) {

  // ircQuery for log lookups
  const ircQuery = new IrcQuery(provider);
  // create filter collection
  let filterIndex = 0;
  let filters = {};
  // create update mutex
  const mutex = new Mutex();
  const waitForFree = mutexMiddlewareWrapper({mutex});

  const middleware = createJsonRpcMiddleware({
    // install filters
    irc_newFilter: waitForFree(createAsyncMiddleware(newLogFilter)),
    irc_newBlockFilter: waitForFree(createAsyncMiddleware(newBlockFilter)),
    irc_newPendingTransactionFilter: waitForFree(createAsyncMiddleware(newPendingTransactionFilter)),
    // uninstall filters
    irc_uninstallFilter: waitForFree(createAsyncMiddleware(uninstallFilterHandler)),
    // checking filter changes
    irc_getFilterChanges: waitForFree(createAsyncMiddleware(getFilterChanges)),
    irc_getFilterLogs: waitForFree(createAsyncMiddleware(getFilterLogs)),
  });

  // setup filter updating and destroy handler
  const filterUpdater = async ({oldBlock, newBlock}) => {
    if (filters.length === 0) return;
    // lock update reads
    const releaseLock = await mutex.acquire();
    try {
      // process all filters in parallel
      await Promise.all(objValues(filters).map(async (filter) => {
        try {
          await BaseFilter.update({oldBlock, newBlock});
        } catch (err) {
          // handle each error individually so filter update errors don't affect other filters
          console.error(err);
        }
      }));
    } catch (err) {
      // log error so we don't skip the releaseLock
      console.error(err);
    }
    // unlock update reads
    releaseLock();
  };

  middleware.destroy = uninstallAllFilters.bind(this);

  return middleware;

  //
  // new filters
  //

  async function newLogFilter(req, res, next) {
    const params = req.params[0];
    const filter = new LogFilter({ircQuery, params});
    const filterIndex = await installFilter(filter);
    res.result = intToHex(filterIndex);
  }

  async function newBlockFilter(req, res, next) {
    const filter = new BlockFilter({ircQuery});
    const filterIndex = await installFilter(filter);
    res.result = intToHex(filterIndex);
  }

  async function newPendingTransactionFilter(req, res, next) {
    const filter = new TxFilter({ircQuery});
    const filterIndex = await installFilter(filter);
    res.result = intToHex(filterIndex);
  }

  //
  // get filter changes
  //

  async function getFilterChanges(req, res, next) {
    const filterIndexHex = req.params[0];
    const filterIndex = hexToInt(filterIndexHex);
    const filter = filters[filterIndex];
    if (!filter) {
      throw new Error('No filter for index "${filterIndex}"');
    }
    res.result = filter.getChangesAndClear();
  }

  async function getFilterLogs(req, res, next, end) {
    const filterIndexHex = req.params[0];
    const filterIndex = hexToInt(filterIndexHex);
    const filter = filters[filterIndex];
    if (!filter) {
      throw new Error('No filter for index "${filterIndex}"');
    }
    res.result = filter.getAllResults();
  }

  //
  // remove filters
  //

  async function uninstallFilterHandler(req, res, next) {
    const filterIndexHex = req.params[0];
    // check filter exists
    const filterIndex = hexToInt(filterIndexHex);
    const filter = filters[filterIndex];
    const result = Boolean(filter);
    // uninstall filter
    if (result) {
      await uninstallFilter(filterIndex);
    }
    res.result = result;
  }

  //
  // utils
  //

  async function installFilter(filter) {
    const prevFilterCount = objValues(filters).length;
    // install filter
    const currentBlock = await blockTracker.getLatestBlock();
    await filter.initialize({currentBlock});
    filterIndex++;
    filters[filterIndex] = filter;
    // update block tracker subs
    const newFilterCount = objValues(filters).length;
    updateBlockTrackerSubs({prevFilterCount, newFilterCount});
    return filterIndex;
  }

  async function uninstallFilter(filterIndex) {
    const prevFilterCount = objValues(filters).length;
    delete filters[filterIndex];
    // update block tracker subs
    const newFilterCount = objValues(filters).length;
    updateBlockTrackerSubs({prevFilterCount, newFilterCount});
  }

  async function uninstallAllFilters() {
    const prevFilterCount = objValues(filters).length;
    filters = {};
    // update block tracker subs
    updateBlockTrackerSubs({prevFilterCount, newFilterCount: 0});
  }

  function updateBlockTrackerSubs({prevFilterCount, newFilterCount}) {
    // subscribe
    if (prevFilterCount === 0 && newFilterCount > 0) {
      blockTracker.on('sync', filterUpdater);
      return;
    }
    // unsubscribe
    if (prevFilterCount > 0 && newFilterCount === 0) {
      blockTracker.removeListener('sync', filterUpdater);
    }
  }

}

function mutexMiddlewareWrapper({mutex}) {
  return (middleware) => {
    return async (req, res, next, end) => {
      // wait for mutex available
      // we can release immediately because
      // we just need to make sure updates aren't active
      const releaseLock = await mutex.acquire();
      releaseLock();
      middleware(req, res, next, end);
    };
  };
}

function objValues(obj, fn) {
  const values = [];
  for (let key in obj) {
    values.push(obj[key]);
  }
  return values;
}
