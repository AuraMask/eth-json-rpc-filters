module.exports = getBlocksForRange;

async function getBlocksForRange({ircQuery, fromBlock, toBlock}) {
  if (!fromBlock) fromBlock = toBlock;
  const fromBlockNumber = hexToInt(fromBlock);
  const toBlockNumber = hexToInt(toBlock);
  const blockCountToQuery = toBlockNumber - fromBlockNumber + 1;
  // load all blocks from old to new (inclusive)
  const missingBlockNumbers = Array(blockCountToQuery)
      .fill()
      .map((_, index) => fromBlockNumber + index)
      .map(intToHex);
  return await Promise.all(missingBlockNumbers.map(blockNum => ircQuery.getBlockByNumber(blockNum, false)));
}

function hexToInt(hexString) {
  if (hexString === undefined || hexString === null) return hexString;
  return Number.parseInt(hexString, 16);
}

function incrementHexInt(hexString) {
  if (hexString === undefined || hexString === null) return hexString;
  const value = hexToInt(hexString);
  return intToHex(value + 1);
}

function intToHex(int) {
  if (int === undefined || int === null) return int;
  let hexString = int.toString(16);
  const needsLeftPad = hexString.length % 2;
  if (needsLeftPad) hexString = '0' + hexString;
  return '0x' + hexString;
}
