const debug = require('./debug')('utils');
const Promise = require('bluebird');
const concatStream = require('concat-stream');
const needle = require('needle');
const mime = require('mime-types');
const urlParse = require('url').parse;

const downloadGetStream = url => needle.get(url);

const downloadGetBuffer = url => {
  return new Promise((resolve, reject) => {
    downloadGetStream(url).pipe(concatStream(resolve)).on('error', reject);
  });
};

const downloadGetBufferAndHeaders = url => {
  return new Promise((resolve, reject) => {
    let headers = {
      'content-type': 'application/octet-stream'
    };
    let stream = downloadGetStream(url);
    stream.on('header', (_s, _h) => headers = _h);
    stream.pipe(concatStream((buffer)=>{
      resolve({ buffer, headers });
    })).on('error', reject);
  });
};

const downloadGetBufferAndType = url => {
  return downloadGetBufferAndHeaders(url).then(({buffer, headers})=>{
    let type, contentType = headers['content-type'];
    if ( contentType ) {
      type = contentType;
    } else {
      type = mime.lookup(urlParse(url).pathname);
    }
    return { buffer, type };
  });
};

const fs = require('fs');
const tmp = require('tmp');

const downloadGetTempfile = url  => {
  return downloadGetBufferAndType(url).then(({ buffer, type}) => {
    const ext = mime.extension(type);
    const tmpfile = tmp.fileSync({ postfix: '.'+ext });
    fs.writeFileSync(tmpfile.name, buffer);
    return { path: tmpfile.name, remove: tmpfile.removeCallback };
  });
};

const autoTagger = (senderId, self) => (text='') => {
  let out;
  if (senderId === undefined) {
    // tag the message to know it was sent by the bridge
    out = self.tagMatrixMessage(text);
  } else {
    out = text;
  }
  return out;
};

module.exports = {
  download: {
    getStream: downloadGetStream,
    getBuffer: downloadGetBuffer,
    getBufferAndHeaders: downloadGetBufferAndHeaders,
    getBufferAndType: downloadGetBufferAndType,
    getTempfile: downloadGetTempfile,
  },
  autoTagger
};

if (!module.parent) {
  module.exports.download.getBufferAndType('https://lh4.googleusercontent.com/--SWFkg5vRpY/AAAAAAAAAAI/AAAAAAAADIU/gGtIbKdVV4c/photo.jpg')
    .then(({buffer, type})=>{
      console.log(buffer.length, type);
    });
}
