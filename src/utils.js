const Promise = require('bluebird');
const concatStream = require('concat-stream');
const needle = require('needle');

const downloadGetStream = url => needle.get(url);

const downloadToBuffer = url => {
  return new Promise((resolve, reject) => {
    downloadGetStream(url).pipe(concatStream(resolve)).on('error', reject);
  });
};

module.exports = {
  download: {
    getStream: downloadGetStream,
    toBuffer: downloadToBuffer
  }
};
