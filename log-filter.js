const BaseFilter = require('./base-filter');
const {bnToHex, hexToInt, incrementHexInt, minBlockRef, blockRefIsNumber} = require('./hexUtils');

class LogFilter extends BaseFilter {

  constructor({ircQuery, params}) {
    super();
    this.type = 'log';
    this.ircQuery = ircQuery;
    this.params = Object.assign({
      fromBlock: 'latest',
      toBlock: 'latest',
      address: undefined,
      topics: [],
    }, params);
    // normalize address
    if (this.params.address) this.params.address = this.params.address.toLowerCase();
    // console.log('LogFilter - constructor - params', this.params)
  }

  async initialize({currentBlock}) {
    // resolve params.fromBlock
    let fromBlock = this.params.fromBlock;
    if (['latest', 'pending'].includes(fromBlock)) fromBlock = currentBlock;
    if ('earliest' === fromBlock) fromBlock = '0x0';
    this.params.fromBlock = fromBlock;
    // set toBlock for initial lookup
    const toBlock = minBlockRef(this.params.toBlock, currentBlock);
    const params = Object.assign({}, this.params, {toBlock});
    // fetch logs and add to results
    const newLogs = await this._fetchLogs(params);
    this.addInitialResults(newLogs);
  }

  async update({oldBlock, newBlock}) {
    // configure params for this update
    const toBlock = newBlock;
    let fromBlock;
    // oldBlock is empty on first sync
    if (oldBlock) {
      fromBlock = incrementHexInt(oldBlock);
    } else {
      fromBlock = newBlock;
    }
    // fetch logs
    const params = Object.assign({}, this.params, {fromBlock, toBlock});
    const newLogs = await this._fetchLogs(params);
    const matchingLogs = newLogs.filter(log => this.matchLog(log));

    // add to results
    this.addResults(matchingLogs);
  }

  async _fetchLogs(params) {
    const newLogs = await this.ircQuery.getLogs(params);
    // de-BN ircQuery results
    newLogs.forEach((log) => {
      log.blockNumber = bnToHex(log.blockNumber);
      log.logIndex = bnToHex(log.logIndex);
      log.transactionIndex = bnToHex(log.transactionIndex);
    });
    // add to results
    return newLogs;
  }

  matchLog(log) {
    // console.log('LogFilter - validateLog:', log)

    // check if block number in bounds:
    // console.log('LogFilter - validateLog - blockNumber', this.fromBlock, this.toBlock)
    if (hexToInt(this.params.fromBlock) >= hexToInt(log.blockNumber)) return false;
    if (blockRefIsNumber(this.params.toBlock) && hexToInt(this.params.toBlock) <= hexToInt(log.blockNumber)) return false;

    // address is correct:
    // console.log('LogFilter - validateLog - address', this.params.address)
    if (this.params.address && this.params.address !== log.address) return false;

    // topics match:
    // topics are position-dependant
    // topics can be nested to represent `or` [[a || b], c]
    // topics can be null, representing a wild card for that position
    // console.log('LogFilter - validateLog - topics', log.topics)
    // console.log('LogFilter - validateLog - against topics', this.params.topics)
    const topicsMatch = this.params.topics.every((topicPattern, index) => {
      // pattern is longer than actual topics
      const logTopic = log.topics[index];
      if (!logTopic) return false;
      // wild card
      const subtopicsToMatch = Array.isArray(topicPattern) ? topicPattern : [topicPattern];
      const subtopicsIncludeWildcard = subtopicsToMatch.includes(null);
      if (subtopicsIncludeWildcard) return true;
      // check each possible matching topic
      const topicDoesMatch = subtopicsToMatch.includes(logTopic);
      return topicDoesMatch;
    });

    // console.log('LogFilter - validateLog - '+(topicsMatch ? 'approved!' : 'denied!')+' ==============')
    return topicsMatch;
  }

}

module.exports = LogFilter;
