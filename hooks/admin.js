module.exports = (bot_token, qs, settings, chats, log) => {
  let ret;
  const chat_id = qs['chat'];
  const text = qs['text'];

  if (chat_id) {
//    chats.addHistory(bot_token, chat_id, {command:'external:admin', msg:'', ts:Date.now()});
    ret = {"actions":[{send:{text}}], chat_id};
  } else {
    log(`[hook:admin] no chat`);
  }
  return ret;
}