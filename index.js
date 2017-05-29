module.exports = {
  utils: require('./src/utils'),
  debug: require('./src/debug'),
  Puppet: require('./src/puppet'),
  MatrixPuppetBridge: require('./src/v2'),
  MatrixPuppetBridgeBase: require('./src/base'),
  MatrixAppServiceBridge: require('matrix-appservice-bridge'),
  MatrixSdk: require('matrix-js-sdk'),
};
