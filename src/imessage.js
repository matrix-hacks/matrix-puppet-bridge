const config = require('../config.json');
const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const Puppet = require('./puppet');
const App = require('./app');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, '../config.json' ));


//const TranscriptReader  = reqi

class iMessageApp extends MatrixPuppetBridgeBase {
  initThirdPartyClient() {
    TranscriptReader.on('message', (message) => {
      // create yoru messgae event handler from 3rd party,
      // call mapThirdPartyRoomMessageData as needed
      let data = this.mapThirdPartyRoomMessageData(message);
      // and call handleThirdPartyRoomMessage once that's done
      this.handleThirdPartyRoomMessage(data);
    });
  }
  getPuppetThirdPartyUserId() {
    return "myself";
  }
  getServicePrefix() {
    return "groupme";
  }
  getThirdPartyRoomDataById(id) {
    return {
      name: id,
      topic: 'iMessage'
    };
  }
  /**
   * Converts the third party service's room message data object to that which we expect in our App
   *
   * @param {object} thirdPartyData Third party's representation of a room message
   * @returns {object} App's representation of a third party room message
   */
  mapThirdPartyRoomMessageData(thirdPartyData) {
    const {
      hash, isMe, message, date, sender, subject, service
    } = thirdPartyData;
    return {
      thirdParty: {
        roomId: isMe ? subject : sender,
        messageId: hash,
        senderName: isMe ? subject : sender,
        senderId: isMe ? subject : sender,
      },
      text: message
    };
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    const sendMessage = this.thirdPartyClient.api.sendGroupMessage(id);
    return sendMessage(text);
  }
}

module.exports = App;
}

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function(reg, callback) {
    puppet.associate().then(()=>{
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart("groupmebot");
      reg.addRegexPattern("users", "@groupme_.*", true);
      callback(reg);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  },
  run: function(port) {
    const app = new App(config, puppet);
    return puppet.startClient().then(()=>{
      return app.initThirdPartyClient();
    }).then(() => {
      return app.bridge.run(port, config);
    }).then(()=>{
      console.log('Matrix-side listening on port %s', port);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  }
}).run();
