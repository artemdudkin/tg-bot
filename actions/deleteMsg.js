const axios = require('axios');
const _get = require('lodash.get');

function deleteMsg(bot_token, chat_id, value, settings, chats, log) {
  value = value || "";
  const chat = chats.get(bot_token, chat_id) || {};

  if (value.toLowerCase() === "prev") {
    let msg;
    for (let i=chat.history.length-1; (i>=0) && (typeof msg != 'object'); i--) {
      msg = chat.history[i].msg;
      if (msg.deleted == true) msg = undefined;
    }
    if (msg && msg.id) {
      log('deleting id', msg.id);
      return delete_message(bot_token, chat_id, msg.id, chats, log)
             .catch( err => log("DELETE MSG ERROR", err));
    }
  } 

  if (value.toLowerCase() === "all") {
    const ids = (chat.history || [])
                .filter( itm => !!_get(itm, "msg.id") && !_get(itm, "msg.deleted"))
                .map(itm => _get(itm, "msg.id"));
    log('deleting ids', ids);
    let ret = Promise.resolve();
    ids.forEach( id => {
      ret = ret.then(() => delete_message(bot_token, chat_id, id, chats, log))
               .catch( err => log("DELETE MSG ERROR", err));
    })
    return ret;
  }
}


function delete_message(bot_token, chat_id, id, chats, log) {
  log(`  >>tg (delete message ${id})`);
  return axios.get(`https://api.telegram.org/bot${bot_token}/deleteMessage?chat_id=${chat_id}&message_id=${id}`)
         .then(res    => {
           log(`  <<tg (delete message ${id}) ok`, res.status)
           const idx = chats.findHistoryItemWithFieldThatContains(bot_token, chat_id, 'msg.id', id, (itm) => {
             itm.msg.deleted = true;
           })
           return res;
         })
         .catch(error => {
           log(`  <<tg (delete message ${id}) error`, error.response.data)
           return Promise.reject(error);
         })
}

module.exports = deleteMsg;