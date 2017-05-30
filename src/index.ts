import { Puppet as MPBPuppet } from './puppet';
import { Base } from './base';

export const MatrixPuppetBridgeBase = Base;
export const Puppet = MPBPuppet;

export const MatrixAppServiceBridge = require('matrix-appservice-bridge');
export const MatrixSdk = require('matrix-js-sdk');
