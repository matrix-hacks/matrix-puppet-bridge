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

let config : Config = {
  serviceName: "Facebook",
  servicePrefix: "facebook",
  port: 8090,
  homeserverDomain: "dev.synapse.mdks.org",
  homeserverUrl:"https://dev.synapse.mdks.org",
  registrationPath: "registration.yaml",
  statusRoomPostfix: "puppetStatusRoom",
  identityPairs: [{
    id: "a",
    matrixPuppet: { localpart: 'puppet' },
    thirdParty: {},
  }]
}

describe("Base.setAdapter", () =>{
  let adapter = <ThirdPartyAdapter>{};
  let puppet = new Puppet(config.identityPairs[0].id, config.homeserverDomain);

  it("sets puppet.adapter", () => {
    let app = new Base(config, puppet);
    app.setAdapter(adapter);
    expect((<any>puppet).adapter).to.deep.equal(adapter);
  });
});

describe("Base constructor", () =>{
  let adapter = <ThirdPartyAdapter>{};
  let puppet = new Puppet(config.identityPairs[0].id, config.homeserverDomain);

  it("uses provided bridge instance", ()=>{
    let bridge = <Bridge>{port:1234};
    let app = new Base(config, puppet, bridge);
    expect((<any>app).bridge).to.deep.equal(bridge);
  });

  it("creates bridge automatically if not provided", ()=>{
    let app = new Base(config, puppet);
    expect((<any>app).bridge).to.be.an.instanceof(Bridge);
  });
});

describe("base.handleThirdPartyRoomMessage", () => {
  let adapter, puppet, bridge;
  let puppetClient;
  let botIntent;
  const msg = <ThirdPartyMessagePayload>{ roomId: 'general', senderId: 'alice', senderName: "Alice", text: 'hello', avatarUrl: 'avatar' };
  const puppetMxid = `@${config.identityPairs[0].matrixPuppet.localpart}:${config.homeserverDomain}`;
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

  const throwStatusRoomErrors = (app) => {
    stub(app, 'sendStatusMsg').callsFake(({},err)=>{
      if (err && err.stack) { throw err }
    });
  }

  before(()=>{
    puppet = new Puppet(config.identityPairs[0].id, config.homeserverDomain);
    puppetClient = makeClient(puppetMxid);
    stub(puppet, 'getClient').returns(puppetClient);
  });

  it("uses the puppet client to lookup the status room and mirror room by alias", ()=>{
    puppetClient.getRoomIdForAlias = stub();
    puppetClient.joinRoom = stub().resolves();
    puppetClient.getRoomIdForAlias.withArgs(mirrorRoomAlias).resolves({ room_id: "mxMirrorRoom" });
    puppetClient.getRoomIdForAlias.withArgs(statusRoomAlias).resolves({ room_id: "mxStatusRoom" });

    let app = new Base(config, puppet);

    stub(app, 'setGhostAvatar').resolves();

    throwStatusRoomErrors(app);

    let getIntentStub = stub((<any>app).bridge, 'getIntent');

    let botIntent = makeIntent(puppetMxid);
    botIntent.setDisplayName = stub().resolves();
    botIntent.setPowerLevel = stub().resolves();
    botIntent.leave = stub().resolves();
    getIntentStub.withArgs().returns(botIntent);

    let ghostIntent = makeIntent(ghostMxid);
    ghostIntent.setDisplayName = stub().resolves();
    ghostIntent.join = stub().resolves();

    let ghostClient = ghostIntent.getClient();
    ghostClient.sendMessage = stub().resolves();
    getIntentStub.withArgs(ghostMxid).returns(ghostIntent);

    return app.handleThirdPartyRoomMessage(msg).then(()=>{
      expect(puppetClient.getRoomIdForAlias.callCount).to.eq(2);
    });
  });


  it("uses the AS bot create the status room", ()=>{
    puppetClient.getRoomIdForAlias = stub();
    puppetClient.joinRoom = stub().resolves();
    puppetClient.getRoomIdForAlias.withArgs(mirrorRoomAlias).resolves({ room_id: "mxMirrorRoom" });
    puppetClient.getRoomIdForAlias.withArgs(statusRoomAlias).onCall(0).rejects();
    puppetClient.getRoomIdForAlias.withArgs(statusRoomAlias).onCall(1).resolves({ room_id: "mxStatusRoom" });

    let app = new Base(config, puppet);

    stub(app, 'setGhostAvatar').resolves();

    throwStatusRoomErrors(app);

    let getIntentStub = stub((<any>app).bridge, 'getIntent');

    let botIntent = makeIntent(puppetMxid);
    botIntent.setDisplayName = stub().resolves();
    botIntent.setPowerLevel = stub().resolves();
    botIntent.createRoom = stub().resolves({ room_id: 'mxStatusRoom' });
    botIntent.leave = stub().resolves();
    getIntentStub.withArgs().returns(botIntent);

    let ghostIntent = makeIntent(ghostMxid);
    ghostIntent.setDisplayName = stub().resolves();
    ghostIntent.join = stub().resolves();

    let ghostClient = ghostIntent.getClient();
    ghostClient.sendMessage = stub().resolves();
    getIntentStub.withArgs(ghostMxid).returns(ghostIntent);

    return app.handleThirdPartyRoomMessage(msg).then(()=>{
      expect((<any>botIntent).createRoom.callCount).to.equal(1);
    });
  })

  it("AS bot creates the mirror room, leaves, and then the ghost sends the message", ()=>{
    puppetClient.getRoomIdForAlias = stub();
    puppetClient.joinRoom = stub().resolves();
    puppetClient.getRoomIdForAlias.withArgs(statusRoomAlias).resolves({ room_id: "mxStatusRoom" });
    puppetClient.getRoomIdForAlias.withArgs(mirrorRoomAlias).onCall(0).rejects();
    puppetClient.getRoomIdForAlias.withArgs(mirrorRoomAlias).onCall(1).resolves({ room_id: "mxMirrorRoom" });

    let adapter = <ThirdPartyAdapter>{};
    adapter.getRoomData = stub().resolves({ name: 'General Chat', topic: "For general discussion" })

    let app = new Base(config, puppet);

    app.setAdapter(adapter);

    stub(app, 'setGhostAvatar').resolves();

    throwStatusRoomErrors(app);

    let getIntentStub = stub((<any>app).bridge, 'getIntent');

    let botIntent = makeIntent(puppetMxid);
    botIntent.setDisplayName = stub().resolves();
    botIntent.setPowerLevel = stub().resolves();
    botIntent.leave = stub().resolves();
    botIntent.createRoom = stub().resolves({ room_id: 'mxMirrorRoom' });
    getIntentStub.withArgs().returns(botIntent);

    let ghostIntent = makeIntent(ghostMxid);
    ghostIntent.setDisplayName = stub().resolves();
    ghostIntent.join = stub().resolves();
    ghostIntent.createRoom = stub().resolves({ room_id: 'mxMirrorRoom' });

    let ghostClient = ghostIntent.getClient();
    ghostClient.sendMessage = stub().resolves();
    getIntentStub.withArgs(ghostMxid).returns(ghostIntent);

    return app.handleThirdPartyRoomMessage(msg).then(()=>{
      expect((<any>ghostIntent).createRoom.callCount).to.equal(0);
      expect((<any>botIntent).createRoom.callCount).to.equal(1);
      expect((<any>botIntent).leave.callCount).to.equal(1);
      expect((<any>ghostClient).sendMessage.callCount).to.eq(1);
    });
  })

})
