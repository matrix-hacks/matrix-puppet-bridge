const Promise = require('bluebird');
const concatStream = require('concat-stream');
const needle = require('needle');

const downloadGetStream = url => needle.get(url);

const downloadToBuffer = url => {
  return new Promise((resolve, reject) => {
    downloadGetStream(url).pipe(concatStream(resolve)).on('error', reject);
  });
};

const downloadToBufferAndHeaders = url => {
  return new Promise((resolve, reject) => {
    let headers, stream = downloadGetStream(url);
    stream.on('header', (_s, _h) => headers = _h);
    stream.pipe(concatStream((buffer)=>{
      resolve({ buffer, headers });
    })).on('error', reject);
  });
};

module.exports = {
  download: {
    getStream: downloadGetStream,
    toBuffer: downloadToBuffer,
    toBufferAndHeaders: downloadToBufferAndHeaders
  }
};

if (!module.parent) {
  module.exports.download.toBufferAndHeaders('https://lh4.googleusercontent.com/--SWFkg5vRpY/AAAAAAAAAAI/AAAAAAAADIU/gGtIbKdVV4c/photo.jpg')
    .then(({buffer, headers})=>{
      console.log(buffer.length, headers['content-type']);
    });
}
