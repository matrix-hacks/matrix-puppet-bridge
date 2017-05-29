const expect = require('chai').expect;

describe('exports', ()=>{
  const ex = require('..');

  it('utils', () => expect(ex.utils).to.be.a('object'));
  it('debug', () => expect(ex.utils).to.be.a('object'));
  it('Puppet', () => expect(ex.utils).to.be.a('object'));
  it('MatrixPuppetBridgeBase', () => expect(ex.utils).to.be.a('object'));
  it('MatrixAppServiceBridge', () => expect(ex.utils).to.be.a('object'));
  it('MatrixSdk', () => expect(ex.utils).to.be.a('object'));
});

