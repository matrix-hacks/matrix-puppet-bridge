import { expect } from 'chai';
const stub = require('sinon').stub;

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

describe('base', ()=>{
  it("handles third party message", () => {
    const app = new Base(
      <Config>{
        servicePrefix: "test",
        serviceName: "Test",
        port: 8090,
        homeserverDomain: "dev.synapse.mdks.org",
        homeserverUrl:"https://dev.synapse.mdks.org",
        registrationPath: "registration.yaml"
      },
      <ThirdPartyAdapter>{
        sendMessage: (thirdPartyRoomId: string, text: string): Promise<void> => {
          return Promise.resolve();
        },
        sendImageMessage: (thirdPartyRoomId: string, ImageData): Promise<void> => {
          return Promise.resolve();
        },
        sendReadReceipt: (thirdPartyRoomId: string): Promise<void> => {
          return Promise.resolve();
        }
      },
      <Puppet>{
        setAdapter:(adapter)=>{
        },
        getClient: () => {
          return <MatrixClient>{
            credentials: <Credentials>{
              userId: ''
            },
            startClient: ()=>{},
            on: (name, callback)=>{},
            getRoomIdForAlias: (alias)=> {
              return Promise.resolve({room_id: ''});
            },
            joinRoom: (id)=> {
              return Promise.resolve();
            }
          }
        }
      },
      <Bridge>{
        getIntent: ()=>{
          return <Intent>{
            getClient: () => {
              return <MatrixClient>{
                credentials: <Credentials>{
                  userId: ''
                }
              }
            },
            setPowerLevel: (roomId: string, userId: string, level: number): Promise<void> => {
              return Promise.resolve()
            },
            join: (roomId: string): Promise<void> => {
              return Promise.resolve()
            },
            sendMessage: (roomId: string, opts): Promise<void> => {
              return Promise.resolve()
            }
          };
        }
      }
    );

    app.handleThirdPartyRoomMessage(<ThirdPartyMessagePayload>{
      roomId: 'foo',
      senderId: 'bar',
      text: 'baz',
    });
  });
});

