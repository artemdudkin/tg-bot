const axios = require('axios');

module.exports = (bot_token, chat_id, value, settings, chats, log) => {
  if (!chats.get(bot_token, chat_id, 'context.trial_vpn_link')) {
    log('  >>ovpn', settings.OVPN_STATS_URL + '/ovpn/add', {day:value});
    return axios.post(settings.OVPN_STATS_URL + '/ovpn/add', {day:value}, {timeout: 2000})
      .then(res => {
        log('  <<ovpn (create_vpn) ok', res.data)
        chats.set(bot_token, chat_id, 'context.trial_vpn_link', res.data.url);
      })
      .catch(error => {
        log('  <<ovpn (create_vpn) error', error)
        return Promise.reject(error); //сохраняем ошибку, чтобы не запустился следующий экшн
      });
  }
}