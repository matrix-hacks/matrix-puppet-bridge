const debug     = require('debug')('matrix-puppet:facebook:utils');
const http      = require("http");
const https     = require("https");
const mime      = require("mime");
const Buffer    = require("buffer").Buffer;
const Promise   = require("bluebird");

function uploadContentFromUrl(client, url, name) {
  const { info } = debug(this.uploadContentFromUrl.name);
  let contentType;
  let size;
  name = name || null;
  return new Promise((resolve, reject) => {
    const ht = url.startsWith("https") ? https : http;
    const req = ht.get((url), (res) => {
      let buffer = Buffer.alloc(0);

      if(res.headers.hasOwnProperty("content-type")) {
        contenttype = res.headers["content-type"];
      }
      else{
        info("No content-type given by server, guessing based on file name.");
        contenttype = mime.lookup(url);
      }

      if (name === null) {
        name = url.split("/");
        name = name[name.length - 1];
      }

      res.on('data', (d) => {
        buffer = Buffer.concat([buffer, d]);
      });

      res.on('end', () => {
        resolve(buffer);
      });
    });

    req.on('error', (err) =>{
      reject(`Failed to download. ${err.code}`);
    });
  }).then((buffer) => {
    size = buffer.length;
    return client.uploadContent(buffer, {
      name,
      type: contenttype,
      onlyContentUri: true,
      rawResponse: false,
    });
  }).then((content_uri) => {
    info("Media uploaded to %s", content_uri);
    return {
      mxc_url: content_uri,
      size
    };
  }).catch(function (reason) {
    info("Failed to upload content:\n%s", reason);
    throw reason;
  });

}

module.exports = {
  uploadContentFromUrl,
}
