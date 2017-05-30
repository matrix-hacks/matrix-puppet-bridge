const expect = require('chai').expect;

const config = {
  "port": 8090,
  "homeserverDomain": "dev.synapse.mdks.org",
  "homeserverUrl":"https://dev.synapse.mdks.org",
  "registrationPath": "registration.yaml"
};

describe('base', ()=>{
  const ex = require('..');

  const Base = ex.MatrixPuppetBridgeBase;


  it("creates an app", () => {
    class App extends Base {
    }
    const app = new App(config);
    expect(app).to.be.an.instanceof(Base);
  });
});

