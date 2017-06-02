const Promise = require('bluebird');
const concatStream = require('concat-stream');
const needle = require('needle');
const mime = require('mime-types');
const urlParse = require('url').parse;
const fs = require('fs');
const tmp = require('tmp');

import { MatrixClient, UploadResponse } from './matrix-client';

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

const FILENAME_TAG = '_mx_'; // goes right before file extension
const FILENAME_TAG_PATTERN = /^.+_mx_\..+$/; // check if tag is right before file extension

export interface DownloadGetTempfileOptions {
  tagFilename: string;
}

const downloadGetTempfile = (url, opts:DownloadGetTempfileOptions) => {
  let tag = opts.tagFilename ? FILENAME_TAG : '';
  return downloadGetBufferAndType(url).then(({ buffer, type}) => {
    const ext = mime.extension(type);
    const tmpfile = tmp.fileSync({ postfix: tag+'.'+ext });
    fs.writeFileSync(tmpfile.name, buffer);
    return { path: tmpfile.name, remove: tmpfile.removeCallback };
  });
};

export const isFilenameTagged = (filepath) => !!filepath.match(FILENAME_TAG_PATTERN);


export const autoTagger = (senderId, self) => (text='') => {
  let out;
  if (senderId === undefined) {
    // tag the message to know it was sent by the bridge
    out = self.tagMatrixMessage(text);
  } else {
    out = text;
  }
  return out;
};

export const createUploader = (client : MatrixClient, name: string, type?: string) => {
  return {
    upload: (buffer : Buffer, opts={})=>{
      return client.uploadContent(buffer, {
        name, type,
        rawResponse: false,
        ...opts
      }).then((res)=>{
        return {
          content_uri: res.content_uri || res,
          size: buffer.length
        };
      });
    }
  }
}
  

export const download = {
  getStream: downloadGetStream,
  getBuffer: downloadGetBuffer,
  getBufferAndHeaders: downloadGetBufferAndHeaders,
  getBufferAndType: downloadGetBufferAndType,
  getTempfile: downloadGetTempfile,
}
