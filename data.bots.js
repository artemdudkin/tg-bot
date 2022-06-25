const clone = require('clone');
const bots = require('./data.storage.file').get('bots');

//��������� ��� ������� xxx:1;2;3 � ��� ������� - xxx:1, xxx:2 � xxx:3 � �.�.
Object.keys(bots.data).forEach( bot_token => {
  const bot = bots.data[bot_token];
  splitActionsWithSemicolon(bot);
  bot.wf.forEach( wf_step => {
    splitActionsWithSemicolon(wf_step);
  })
})
function splitActionsWithSemicolon(o) {
    const actions = o.on || {};
    Object.keys(actions).forEach( key => {
      const prefix = key.split(':')[0];
      const subkeys = key.split(':')[1] || '';
      if (subkeys.indexOf(';') !== -1) {
        subkeys.split(';').forEach( subkey => {
          o.on[prefix + ':' + subkey] = o.on[key];
        })
        delete o.on[key];
      }
    });
}
//������ ������ ����� �� ����, ��� ���-��
bots.data = Object.freeze(bots.data);

Object.keys(bots.data).forEach( (bot_token, index) => {
  console.log(`  bot[${index}]`, bot_token);
})



function get(bot_token) {
  return clone(bots.data[bot_token]);
}

module.exports = {
  get,
}