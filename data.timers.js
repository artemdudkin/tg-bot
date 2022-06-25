const utils = require('./utils');
const fstorage = require('./data.storage.file');

/**
 * data.storage.file will use this method to convert 'timers' object to string (on saving data)
 */
fstorage.get('timers').serialize = function(){
  let data = fstorage.get('timers').data;
  let serializable_data = {}
  Object.keys(data).forEach( bot_token => {
    Object.keys(data[bot_token]).forEach( chat_id => {
      data[bot_token][chat_id].forEach( itm => {

        if (!serializable_data[bot_token]) serializable_data[bot_token] = {};
        if (!serializable_data[bot_token][chat_id]) serializable_data[bot_token][chat_id] = [];

        serializable_data[bot_token][chat_id].push({
            date: itm.date,
            key: itm.key
        });
      })
    })
  })
  return JSON.stringify(serializable_data, null, 4);
}


/**
 * Start all saved timers on app start
 */
function startAll( timerCallbackFunc) {
  let timers = fstorage.get('timers');

  let counter = 0;
  let counter_started = 0;
  Object.keys(timers.data).forEach( bot_token => {
    Object.keys(timers.data[bot_token]).forEach( chat_id => {
      const t = timers.data[bot_token][chat_id] || [];
      let newTimers = [];
      t.forEach( itm => {
        counter++;
        try{

          let ms = new Date(itm.date).getTime() - Date.now();
          let t = run(() => {
            timerCallbackFunc(bot_token, chat_id, itm.key);
          }, ms, bot_token, chat_id);

          newTimers.push({
            timer_id : t, 
            date: itm.date, 
            key: itm.key
          });
          counter_started++;
        } catch (e) {
          utils.log("[timers] ERROR", e);
        }
      })
      timers.data[bot_token][chat_id] = newTimers;
    })
  })
  utils.log("[data:timers]", "loaded", counter, "started", counter_started);
}

/**
 * Stop all timer from prev wf step and start timer from current wf step 
 * (also saves started timers to start it again after server restart)
 */
function stopAllChatTimersAndStartNew(bot_token, chat_id, keyArray, timerCallbackFunc) {//timerCallbackFunc(bot_token, chat_id, key)
      //stop timers if any (at prev step)
      let timerCount = count(bot_token, chat_id);
      if (timerCount > 0) {
        try { 
          get(bot_token, chat_id).forEach(t => {
            clearTimeout(t.timer_id)
          })
        } catch(e) {}
        utils.log(`[chat_id:${chat_id}] ${timerCount} timer(s) stoped`);
      }
      clearAll(bot_token, chat_id);

      //start timers if any (at current step)
      keyArray.forEach( key => {
        let {0:cmd, 1:val} = key.split(':');
        if (cmd === 'timer') {
          utils.log(`[chat_id:${chat_id}] starting '${key}' timer`);
          try {
            if (val.indexOf('-') !== -1) {
              let d = val.split('-');
              val = new Date( +d[0], +d[1]-1, +d[2], +d[3] || 0, +d[4] || 0, +d[5] || 0).getTime() - Date.now();
            } else {
              val = +val;
            }

            let t = run(() => {
              timerCallbackFunc(bot_token, chat_id, key)
            }, val, bot_token, chat_id, key);

            add(bot_token, chat_id, t, '' + (new Date(Date.now()+val)), key);

            utils.log(`[chat_id:${chat_id}] timer was started for '${val}' ms`);
          } catch (e) {
            utils.log(`ERROR cannot start timer '${key}'`, e);
          }
        }
      })
}


function run(cb, ms, bot_token, chat_id) {
  let uuid = utils.getUUID();
  let t = setTimeout(() => {
    clear(bot_token, chat_id, uuid);
    cb();
  }, ms);
  t.uuid = uuid;
  return t;
}

function count(bot_token, chat_id) {
  let timers = fstorage.get('timers');

  chat_id = ''+chat_id;
  if (!timers.data[bot_token]) timers.data[bot_token] = {}
  if (!timers.data[bot_token][chat_id]) timers.data[bot_token][chat_id] = []
  return timers.data[bot_token][chat_id].length;
}

function get(bot_token, chat_id) {
  let timers = fstorage.get('timers');

  chat_id = ''+chat_id;
  if (!timers.data[bot_token]) timers.data[bot_token] = {}
  if (!timers.data[bot_token][chat_id]) timers.data[bot_token][chat_id] = []
  return timers.data[bot_token][chat_id];
}

function add(bot_token, chat_id, timer_id, date, key) {
  let timers = fstorage.get('timers');

  chat_id = ''+chat_id;
  if (!timers.data[bot_token]) timers.data[bot_token] = {}
  if (!timers.data[bot_token][chat_id]) timers.data[bot_token][chat_id] = []
  timers.data[bot_token][chat_id].push({
    timer_id, 
    date,
    key
  });
//  timers.changed = true;
  fstorage.forceSave('timers');
}

function clearAll(bot_token, chat_id) {
  let timers = fstorage.get('timers');

  chat_id = ''+chat_id;
  if (!timers.data[bot_token]) timers.data[bot_token] = {}
  timers.data[bot_token][chat_id] = [];
//  timers.changed = true;
  fstorage.forceSave('timers');
}

function clear(bot_token, chat_id, uuid) {
  let timers = fstorage.get('timers');

  chat_id = ''+chat_id;
  if (!timers.data[bot_token]) timers.data[bot_token] = {}
  if (!timers.data[bot_token][chat_id]) timers.data[bot_token][chat_id] = [];

  let t = timers.data[bot_token][chat_id];
  let oldLen = t.length;
  timers.data[bot_token][chat_id] = t.filter( itm => (itm.timer_id.uuid !== uuid));

  if (oldLen !== timers.data[bot_token][chat_id].length) {
    fstorage.forceSave('timers');
  } else {
    utils.log(`[timer] ${uuid} not found at ${chat_id}`, timers.data[bot_token][chat_id]);
  }
}


module.exports = {
  startAll,
  stopAllChatTimersAndStartNew,
}