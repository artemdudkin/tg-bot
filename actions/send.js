const axios = require('axios');
const _get = require('lodash.get');

function send(bot_token, chat_id, msg, settings, chats, log) {
    msg.text = apply_context(msg.text, chats.get(bot_token, chat_id, 'context'));

    log('  >>tg', msg);
    return axios.post('https://api.telegram.org/bot'+bot_token+'/sendMessage', { chat_id: chat_id, ...msg})
         .then(res    => {
           log('  <<tg (bot message) ok', res.status)
           msg.id = _get(res.data, "result.message_id");
           msg.status = "sent";
         })
         .catch(error => {
           log('  <<tg (bot message) error', error)
           msg.status = "error";
           msg.error = _get(error, "response.data");
         })
//         .then( () => {
           //сохраняем команду и сообщение пользователю в истории
//           chats.addHistory(bot_token, chat_id, {command:"", msg, ts:Date.now()});
//         })
}


function apply_context(text, context) {
  Object.keys(context).forEach( key => {
    const re = new RegExp('\\$\\{'+key+'\\}', 'g');
    text = text.replace(re, context[key]);
  })
  return text;
}


module.exports = send;