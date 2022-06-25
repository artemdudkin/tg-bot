module.exports = (bot_token, chat_id, value, settings, chats, log) => {
  chats.set(bot_token, chat_id, 'wf_step_id', value);
}