# matrix-puppet-bridge

This project provides a base class for a style of Matrix bridge which primarily acts as or "puppets" a specific user (usually yourself) on your homeserver and on a third party service.

There is a common pattern in this style of bridge, such as duplicate message issues, which are dealt with by this module.

## Examples

These bridges have been built using matrix-puppet-bridge:

* https://github.com/kfatehi/matrix-appservice-imessage
* https://github.com/kfatehi/matrix-appservice-groupme

## FAQ

Q: Why puppetting?

A: Please see [this commit](https://github.com/kfatehi/matrix-appservice-imessage/commit/8a832051f79a94d7330be9e252eea78f76d774bc)

Q: How can I prevent long push notification messages for 1 on 1 conversations?

A: At this time we recommend modifying sygnal. For example, see this commit: 
https://github.com/AndrewJDR/sygnal/commit/3813ef48a1be1b6015953974a13ee4da2b704882


