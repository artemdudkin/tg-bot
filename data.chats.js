const _set = require('lodash.set');
const _get = require('lodash.get');
const clone = require('clone');
const chats = require('./data.storage.file').get('chats');

function get(bot_token, chat_id, fieldName) {
  if (!chats.data[bot_token]) chats.data[bot_token] = {}
  if (!chats.data[bot_token][chat_id]) {
    chats.data[bot_token][chat_id] = {context:{}, history:[]};
    chats.changed = true;
  }

  if (!fieldName) {
    ret = clone( chats.data[bot_token][chat_id]);
  } else {
    ret = clone( _get( chats.data[bot_token][chat_id], fieldName));
  }
  return ret;
}

function getAll(bot_token) {
  if (!chats.data[bot_token]) chats.data[bot_token] = {}
  return clone( chats.data[bot_token]);
}

function set(bot_token, chat_id, fieldName, fieldValue) {
  if (!fieldName) return;

  if (!chats.data[bot_token]) chats.data[bot_token] = {}
  if (!chats.data[bot_token][chat_id]) {
    chats.data[bot_token][chat_id] = {context:{}, history:[]};
    chats.changed = true;
  }

  _set(chats.data[bot_token][chat_id], fieldName, fieldValue);
  chats.changed = true;
}

function addHistory(bot_token, chat_id, value) {
  chats.data[bot_token][chat_id].history.push(value);
  chats.changed = true;
}

/*
function findId(fieldName, fieldValue) {
  const idList = Object.keys(chats.data);
  for (let i=0; i<idList.length; i++) {
    const chat_id = idList[i];
console.log( 'fieldName', fieldName, 'chat_id', chat_id, 'value', _get(chats.data[chat_id], fieldName), 'fieldValue', fieldValue);
    if (_get(chats.data[chat_id], fieldName) == fieldValue) {
      return chat_id;
    }
  }
}
*/

function findChatIdWithFieldThatContains(bot_token, fieldName, fieldValue){
  const idList = Object.keys(chats.data[bot_token]);

  for (let i=0; i<idList.length; i++) {
    const chat_id = idList[i];
    const value = _get(chats.data[bot_token][chat_id], fieldName);
    if (typeof value === 'string' && value.indexOf(fieldValue) !== -1) {
      return chat_id;
    }
  }
}


function findHistoryItemWithFieldThatContains(bot_token, chat_id, fieldName, fieldValue, cb) {
  const chat = chats.data[bot_token][chat_id] || {history:[]};
  let found;
  for( let i=chat.history.length-1; i>=0 && !found; i--) {
    let itm = chat.history[i];
//console.log(i, 'fieldName', fieldName, '_get(itm, fieldName)', _get(itm, fieldName), 'value', fieldValue);
    if (_get(itm, fieldName) === fieldValue) {
      found = i;
      cb(itm);
//console.log('findHistoryIndexWithFieldThatContains itm', itm);
      chats.changed = true;
    }
  }
//  return found;
}

module.exports = {
  get,
  getAll,
  set,
//  findId,
  findChatIdWithFieldThatContains,
  findHistoryItemWithFieldThatContains,
  addHistory,
}