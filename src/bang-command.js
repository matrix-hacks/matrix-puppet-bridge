// Thanks to
// https://github.com/krismuniz/slash-command/blob/4349ea6b60e6451b6b6537ea4551b8c522b4be87/index.js
'use strict';
const bangCommand = (s) => {
  if ( !s.startsWith('!') ) return null;
  let cmds = s.split(' ')[0].match(/\!([\w-=:.@]+)/ig);
  let bangcmds = null;
  let subcmds = null;
  let body = s.trim() || null;

  if (cmds) {
    bangcmds = cmds.join('');
    cmds = cmds.map(x => x.replace('!',''));
    subcmds = cmds.length > 1 ? cmds.filter(v => v !== cmds[0]) : null;
    body = s.split(' ').filter((v, i) => i > 0).join(' ').trim() || null;
  }

  return {
    bangcommand: bangcmds,
    command: cmds ? cmds[0] : null,
    subcommands: subcmds,
    body: body,
    original: s
  };
};

module.exports = bangCommand;
