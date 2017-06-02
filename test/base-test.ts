import { expect } from 'chai';
import { stub } from 'sinon';
import { Puppet } from '../src/puppet';
import { Base } from '../src/base';
import { Config } from '../src/config';
import {
  ThirdPartyAdapter,
  ThirdPartyMessagePayload
} from '../src/third-party-adapter';
import { Bridge } from 'matrix-appservice-bridge';
import { Intent } from '../src/intent';
import { Credentials, MatrixClient } from '../src/matrix-client';

let config = <Config>{
  servicePrefix: "facebook",
  serviceName: "Facebook",
  port: 8090,
  homeserverDomain: "dev.synapse.mdks.org",
  homeserverUrl:"https://dev.synapse.mdks.org",
  registrationPath: "registration.yaml",
  statusRoomPostfix: "puppetStatusRoom"
}


describe("Base constructor", () =>{
  let adapter = <ThirdPartyAdapter>{};
  let puppet = new Puppet('');

  it("sets puppet.adapter", () => {
    let app = new Base(config, adapter, puppet);
    expect((<any>puppet).adapter).to.deep.equal(adapter);
  });

  it("uses provided bridge instance", ()=>{
    let bridge = <Bridge>{port:1234};
    let app = new Base(config, adapter, puppet, bridge);
    expect((<any>app).bridge).to.deep.equal(bridge);
  });

  it("creates bridge automatically if not provided", ()=>{
    let app = new Base(config, adapter, puppet);
    expect((<any>app).bridge).to.be.an.instanceof(Bridge);
  });
});

describe("base.handleThirdPartyRoomMessage", () => {
  let adapter, puppet, bridge;
  let puppetClient;
  let botIntent;
  const msg = <ThirdPartyMessagePayload>{ roomId: 'general', senderId: 'alice', senderName: "Alice", text: 'hello', avatarUrl: 'avatar' };
  const puppetMxid = `@puppet:${config.homeserverDomain}`;
  const ghostMxid = `@${config.servicePrefix}_${msg.senderId}:${config.homeserverDomain}`;
  const mirrorRoomAlias = `#${config.servicePrefix}_${msg.roomId}:${config.homeserverDomain}`;
  const statusRoomAlias = `#${config.servicePrefix}_${config.statusRoomPostfix}:${config.homeserverDomain}`;

  const makeClient = (mxid) => {
    return <MatrixClient>{
      credentials: <Credentials>{ userId: mxid }
    }
  }

  const makeIntent = (mxid) => {
    let client = makeClient(mxid)
    return <Intent>{
      getClient: () => client
    }
  }

  before(()=>{
    adapter = <ThirdPartyAdapter>{};
    puppet = new Puppet('');
    puppetClient = makeClient(puppetMxid);
    stub(puppet, 'getClient').returns(puppetClient);
  });

  it("uses the puppet client to lookup the status room and mirror room by alias", ()=>{
    puppetClient.getRoomIdForAlias = stub();
    puppetClient.joinRoom = stub().resolves();
    puppetClient.getRoomIdForAlias.withArgs(mirrorRoomAlias).resolves({ room_id: "mxMirrorRoom" });
    puppetClient.getRoomIdForAlias.withArgs(statusRoomAlias).resolves({ room_id: "mxStatusRoom" });

    let app = new Base(config, adapter, puppet);

    stub(app, 'setGhostAvatar').resolves();
    stub(app, 'sendStatusMsg').callsFake(({},err)=>{
      if (err && err.stack) { throw err }
    });

    let getIntentStub = stub((<any>app).bridge, 'getIntent');

    let botIntent = makeIntent(puppetMxid);
    botIntent.setDisplayName = stub().resolves();
    botIntent.setPowerLevel = stub().resolves();
    getIntentStub.withArgs().returns(botIntent);

    let ghostIntent = makeIntent(ghostMxid);
    ghostIntent.setDisplayName = stub().resolves();
    ghostIntent.join = stub().resolves();

    let ghostClient = ghostIntent.getClient();
    ghostClient.sendMessage = stub().resolves();
    getIntentStub.withArgs(ghostMxid).returns(ghostIntent);

    return app.handleThirdPartyRoomMessage(msg).then(()=>{
      expect(puppetClient.getRoomIdForAlias.callCount).to.eq(2);
      (<any>app).bridge.getIntent.restore();
    });
  });


  it.skip("has the AS bot create the status room", ()=>{
    let puppetGetRoomIdForAlias = stub(puppetClient, 'getRoomIdForAlias');
    puppetGetRoomIdForAlias.withArgs(mirrorRoomAlias).resolves({ room_id: "mxMirrorRoom" });
    puppetGetRoomIdForAlias.withArgs(statusRoomAlias).onCall(0).rejects();
    puppetGetRoomIdForAlias.withArgs(statusRoomAlias).onCall(1).resolves({ room_id: "mxStatusRoom" });

    let app = new Base(config, adapter, puppet);

    let bridgeGetIntentStub = stub((<any>app).bridge, 'getIntent');

    let botIntentCreateRoomStub = stub(<any>botIntent, 'createRoom');
    botIntentCreateRoomStub.resolves({ room_id: 'mxStatusRoom' });

    bridgeGetIntentStub.withArgs().returns(botIntent);

    return app.handleThirdPartyRoomMessage(msg).then(() => {
      expect(puppetGetRoomIdForAlias.callCount).to.eq(2);
      console.log(bridgeGetIntentStub.getCall(2).args[0]);
      expect(botIntentCreateRoomStub.callCount).to.eq(1);
      puppetGetRoomIdForAlias.restore();
      botIntentCreateRoomStub.restore();
      bridgeGetIntentStub.restore();
    });

  })

  it.skip("has the AS ghost user create the mirror room and send the message", ()=>{
    let puppetGetRoomIdForAlias = stub(puppetClient, 'getRoomIdForAlias');
    puppetGetRoomIdForAlias.withArgs(statusRoomAlias).resolves({ room_id: "mxStatusRoom" });
    puppetGetRoomIdForAlias.withArgs(mirrorRoomAlias).onCall(0).rejects();
    puppetGetRoomIdForAlias.withArgs(mirrorRoomAlias).onCall(1).resolves({ room_id: "mxMirrorRoom" });

    let app = new Base(config, adapter, puppet);

    let bridgeGetIntentStub = stub((<any>app).bridge, 'getIntent');

    let botIntentCreateRoomStub = stub(<any>botIntent, 'createRoom');

    bridgeGetIntentStub.withArgs().returns(botIntent);
     
    return app.handleThirdPartyRoomMessage(msg).then(() => {
      expect(puppetGetRoomIdForAlias.callCount).to.eq(2);
      expect(botIntentCreateRoomStub.callCount).to.eq(0);
      console.log(bridgeGetIntentStub.getCall(1).args);
      puppetGetRoomIdForAlias.restore();
      bridgeGetIntentStub.restore();
    });

  })

})
