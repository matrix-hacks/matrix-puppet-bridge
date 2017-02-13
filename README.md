# matrix-puppet-bridge

This project provides a base class for a style of Matrix bridge which primarily acts as or "puppets" a specific user (usually yourself) on your homeserver and on a third party service.

There is a common pattern in this style of bridge, such as duplicate message issues, which are dealt with by this module.

## Examples

These bridges have been built using matrix-puppet-bridge:

* https://github.com/kfatehi/matrix-puppet-imessage
* https://github.com/kfatehi/matrix-puppet-groupme
* https://github.com/kfatehi/matrix-puppet-facebook
* https://github.com/kfatehi/matrix-puppet-slack
* https://github.com/AndrewJDR/matrix-puppet-hangouts

## FAQ

### Q: What about service X?

Right now I recommend you look at the examples. Right now the most complex example in terms of creating a client is imessage. The most complex example in terms of needing to make additional calls like looking up user info, check out the facebook one. For a basic middle-ground, check the groupme one.

### Q: Why puppetting?

Please see [this commit](https://github.com/kfatehi/matrix-appservice-imessage/commit/8a832051f79a94d7330be9e252eea78f76d774bc)

### Q: How can I prevent long push notification messages for 1 on 1 conversations?

At this time we recommend modifying sygnal. For example, see this commit: 
https://github.com/AndrewJDR/sygnal/commit/3813ef48a1be1b6015953974a13ee4da2b704882

The prefix seen by sygnal is that which you configure on your class:

```javascript
class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return "__mbp__someservice";
  }
}
```

In the examples above, "__mpb__" was used as the special tag, but it can be anything you want. Keep in mind that getServicePrefix is called for creating rooms and ghost users, and also needs to match your appserver yaml file, so plan for this and expect this to be a source of problems when changing it after having run the bridge for awhile under a different service prefix.

### Q: How can I add bang (!) commands to a room, such as !echo

`matrix-puppet-bridge` comes with a bang command processor. Simply define a method and it will be invoked instead of being forwarded to the third perty service:

```javascript
class App extends MatrixPuppetBridgeBase {
	handleMatrixUserBangCommand(bangCmd, matrixMsgEvent) {
		const { bangcommand, command, body } = bangCmd;
		const { room_id } = matrixMsgEvent;
		const client = this.puppet.getClient();
		const reply = (str) => client.sendNotice(room_id, str);
		if ( command === 'help' ) {
			reply([
				'Bang Commands',
				'!help .......... display this information',
				'!echo <text> ... repeat text back to you',
				'!sync .......... synchronize this room with 3rd party service',
			].join('\n'));
		} else if ( command === 'echo' ) {
			reply(body);
		} else if ( command === 'sync' ) {
			reply('command not implemented yet: '+bangcommand);
		} else {
			reply('unrecognized command: '+bangcommand);
		}
	}
}
```

### Q: My access token has changed. How can I update my access token on the bridge?

Run this in your bridge directory:

`node -e "new (require('matrix-puppet-bridge').Puppet)('config.json').associate()"`
