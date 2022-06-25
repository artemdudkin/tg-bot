module.exports = (bot_token, qs, settings, chats, log) => {
  let ret;
  const name = qs['name'];
  const chat_id = chats.findChatIdWithFieldThatContains(bot_token, 'context.trial_vpn_link', name+'.ovpn');

  if (chat_id) {
    ret = {command:'expired', chat_id};
  } else {
    log(`[hook:expired] chat for '${name}' was not found.`);
  }
  return ret;
}