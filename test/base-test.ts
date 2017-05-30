import { expect } from 'chai';
const stub = require('sinon').stub;

import { Puppet } from '../src/puppet';
import { Base } from '../src/base';
import { Config } from '../src/config';
import { ThirdPartyAdapter } from '../src/third-party-adapter';

const config : Config = {
  servicePrefix: "test",
  serviceName: "Test",
  port: 8090,
  homeserverDomain: "dev.synapse.mdks.org",
  homeserverUrl:"https://dev.synapse.mdks.org",
  registrationPath: "registration.yaml"
};

describe('base', ()=>{
  it("creates an app", () => {
    const puppet = new Puppet('');
    puppet.setApp = stub();
    //class Thing {
    //  sendMessage(thirdPartyRoomId: string, text: string) {
    //    return new Promise(function(resolve, reject) {
    //    });
    //  }
    //  sendImageMessage(thirdPartyRoomId: string, ImageData) {
    //    return Promise.resolve();
    //  }
    //  sendReadReceipt(thirdPartyRoomId: string) {
    //    return Promise.resolve();
    //  }
    //  getRoomData?(thirdPartyRoomId: string) {
    //    return Promise.resolve({ name: 'foo', topic: 'bar' })
    //  }
    //  getUserData?(thirdPartyUserId: string) {
    //    return Promise.resolve({ name: 'foo' });
    //  }
    //  handleMatrixUserBangCommand(cmd: BangCommand, data: object) {
    //    return Promise.resolve();
    //  }
    //}
    const adapter = <ThirdPartyAdapter>{
      sendMessage(thirdPartyRoomId: string, text: string): Promise<void> {
        return Promise.resolve();
      }
    };
    console.log(adapter);
    const app = new Base(config, adapter, puppet);
  });
});

