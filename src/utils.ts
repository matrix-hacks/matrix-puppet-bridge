import * as fs from 'async-file';
import * as concatStream from 'concat-stream';
import { AllHtmlEntities as Entities } from 'html-entities';
import * as mime from 'mime';
import * as needle from 'needle';
import * as tmp from 'tmp';
import { parse as urlParse} from 'url';

export const entities = new Entities();

const downloadGetStream = (url, options?) => needle.get(url, options);

const downloadGetBuffer = (url, options?) => {
  return new Promise((resolve, reject) => {
    downloadGetStream(url, options).pipe(concatStream(resolve)).on('error', reject);
  });
};

const downloadGetBufferAndHeaders = (url, options?) => {
  return new Promise((resolve, reject) => {
    let headers = {
      'content-type': 'application/octet-stream'
    };
    let stream = downloadGetStream(url, options);
    stream.on('header', (_s, _h) => headers = _h);
    stream.pipe(concatStream((buffer)=>{
      resolve({ buffer, headers });
    })).on('error', reject);
  });
};

const downloadGetBufferAndType = (url, options?) => {
  return downloadGetBufferAndHeaders(url, options).then(({buffer, headers})=>{
    let type, contentType = headers['content-type'];
    if ( contentType ) {
      type = contentType;
    } else {
      type = mime.lookup(urlParse(url).pathname);
    }
    type = type.split(';')[0];
    return { buffer, type };
  });
};

const FILENAME_TAG = '_mx_'; // goes right before file extension
const FILENAME_TAG_PATTERN = /^.+_mx_\..+$/; // check if tag is right before file extension
export const isFilenameTagged = (filepath) => !!filepath.match(FILENAME_TAG_PATTERN);

export interface DownloadGetTempfileOptions {
  tagFilename: string;
}

function downloadGetTempfile(url, opts:DownloadGetTempfileOptions) {
  let tag = opts.tagFilename ? FILENAME_TAG : '';
  return downloadGetBufferAndType(url).then(({ buffer, type}) => {
    const ext = mime.extension(type);
    const tmpfile = tmp.fileSync({ postfix: tag+'.'+ext });
    fs.writeFile(tmpfile.name, buffer).then(() => {
      return { path: tmpfile.name, remove: tmpfile.removeCallback };
    });
  });
};


export const download = {
  getStream: downloadGetStream,
  getBuffer: downloadGetBuffer,
  getBufferAndHeaders: downloadGetBufferAndHeaders,
  getBufferAndType: downloadGetBufferAndType,
  getTempfile: downloadGetTempfile,
}

const localdiskGetBufferAndType = (localpath: string) : Promise<{buffer: Buffer, type:string}> => {
  return fs.readFile(localpath).then(buffer=>{
    return { buffer, type: mime.lookup(localpath) };
  });
};


export const localdisk = {
  getBufferAndType: localdiskGetBufferAndType,
}
