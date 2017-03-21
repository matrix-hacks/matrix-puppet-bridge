module.exports = {
  Puppet: require('./src/puppet'),
  MatrixPuppetBridgeBase: require('./src/base'),
  MatrixAppServiceBridge: require('matrix-appservice-bridge'),
  MatrixSdk: require('matrix-js-sdk'),
  utils: require('./src/utils'),
};
