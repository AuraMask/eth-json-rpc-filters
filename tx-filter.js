const flatMap = require('lodash.flatmap');
const BaseFilter = require('./base-filter');
const getBlocksForRange = require('./getBlocksForRange');
const {incrementHexInt} = require('./hexUtils');

class TxFilter extends BaseFilter {

  constructor({ircQuery, params}) {
    super();
    this.type = 'tx';
    this.ircQuery = ircQuery;
  }

  async update({oldBlock, newBlock}) {
    const toBlock = oldBlock;
    const ircQuery = this.ircQuery;
    const fromBlock = incrementHexInt(oldBlock);
    const blocks = await getBlocksForRange({ircQuery, fromBlock, toBlock});
    const blockTxHashes = flatMap(blocks, (block) => block.transactions);
    // add to results
    this.addResults(blockTxHashes);
  }

}

module.exports = TxFilter;
