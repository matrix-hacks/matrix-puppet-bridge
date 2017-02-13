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

There are two kinds of puppetting happening here:
#### 3rd party user puppetting
The bridge is logging into hangouts/facebook/slack/etc in such a way that it appears to send messages as you. From the perspective of other hangouts/facebook/slack users, all messages appear to come from your actual user, not from a bot or anything along those lines.
#### Matrix user puppetting
The bridge is logging into your matrix homeserver with your matrix username, and sometimes sends messages *as* your username. Why is this necessary? If you happen to send a message using a native hangouts/facebook/slack/etc client rather than using the bridge, we want to propogate the message you sent over to matrix somehow; This way you can see the entire context of your conversation within matrix, even if some of your messages were sent using a native hangouts/facebook/etc client. This means it has to appear to come from someone that represents you somehow. So why not create a ghost/bot user on the matrix side that represents your "facebook/hangouts self" for this purpose (e.g. "@YourName\_facebook:your-hs.example.org")? This approach has the following limitations:
* If the bridge is not able to log in as you, it is not empowered with the ability to automatically join you to roms. This means you must still manually accept invites for your matrix user to any newly created bridge rooms. This is especially bad if a brand new new contact messages you on facebook/hangouts/etc -- the bridge creates a new room and you may get a push notification with the room invite but no notification containing their actual message text. You would have to open the matrix client and join the room to see their message. This is an extra manual step and is not convenient compared to what we've become accustomed to with messaging apps.
* If sending from the native hangouts/facebook/etc app, and this gets sent in matrix by a virtual secondary user/bot that represents yourself rather than your *real* self, in matrix's eyes, this is considered a new unread message in the room, so the room state is changed to "unread" -- generally a bold room name in the matrix client. This does not really reflect the reality of the situation; Given I'm the one that sent the new message, I've of course already read the message. Ultimately this gets pretty annoying, especially if you tend (like myself) to use these bold unread room states indicators to help quickly catch up on older missed messages.

For these reasons (and some other minor reasons I won't mention here), we settled on puppetting the matrix user.

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
