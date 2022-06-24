const http = require('http');
const express = require('express');
const serveStatic = require('serve-static');
const compression = require('compression');
const axios = require('axios');
const get = require('lodash.get');
const utils = require('./utils');
const bots = require('./data.bots');
const chats = require('./data.chats');
const timers = require('./data.timers');

//запустим все таймеры при старте приложения (если они есть)
timers.startAll( (bot_token, chat_id, key) => {
  do_command(key, chat_id, bot_token);
});


const SERVER_PORT = 8094;
const OVPN_STATS_URL = 'http://79.137.133.102:8094';

utils.log('cwd dir == ' + process.cwd());
utils.log("config dir == ", __dirname);
utils.log('port == ' + SERVER_PORT);
utils.log('ovpn stats url == ' + OVPN_STATS_URL);

var app = express();

app.use(compression());

//static files
app.use(serveStatic('./html'));

//лог запроса
app.use(function(req, res, next) {
  utils.log('<<', req.method, req.protocol + '://' + req.get('host') + req.originalUrl);
  next();
})

// получение тела запроса полностью
app.use (function(req, res, next) {
    var data='';
    req.setEncoding('utf8');
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      //превратим req.body в json
      if (data) {
        try { 
          req.body = JSON.parse(data);
          utils.log('<< body', JSON.stringify(req.body, null, 4));
        } catch(e) {
          req.body = data
          utils.log('<< cannot parse body', req.body);
        }
      } else {
        req.body = {}
      }

      next();
    });
});

/*
app.all('/test', function(req, res, next) {
  utils.log('body', req.body);
  res.end( 'OK');
})
*/

app.all('/getChats', function(req, res, next) {
  const bot_token = req.body.bot_token;
  if (bots.get(bot_token)) {
    res.end( JSON.stringify(chats.getAll(bot_token)));
  } else {
    res.status(404).end();
  }
})


app.all('/hook', async function(req, res, next) {
  //ничего отвечать не надо
  res.end();

  const qs = req.query;
  const bot_token = qs['bot'];
  const name = qs['hook'];
  if (hooks[name]) {
    hooks[name](bot_token, qs);
  } else {
    utils.log(`hook ${name} not found`);
  }
})

app.all('/message', async function(req, res, next) {
  //ничего отвечать не надо - бот, если ннада, ответит отдельным запросом 
  res.end();

  const qs = req.query;
  const bot_token = qs['bot'];

  //завершение callback_query - в любом случае
  const callback_query_id = get(req.body, 'callback_query.id');
  do_query_close(bot_token, callback_query_id);

  //обработка команды, которая пришла от пользователя
  const bot = bots.get(bot_token);
  const chat_id = get(req.body, 'message.chat.id') 
                  || get(req.body, 'edited_message.chat.id') 
                  || get(req.body, 'callback_query.message.chat.id') || undefined;
  const command = 'msg:' + (get(req.body, 'callback_query.data') || get(req.body, 'message.text') || get(req.body, 'edited_message.text')) ;
  try {
    if (bot && chat_id) {
      //сохранение юзера при самом первом запуске
      if (command === 'msg:/start') {
        let userDetails = get(req.body, 'message.from');
        chats.set(bot_token, chat_id, 'from', userDetails);
      }
      await do_command(command, chat_id, bot_token);
    } else {
      if (!bot) utils.log("ERROR: unknow bot", bot_token, 'qs', qs);
      if (!chat_id) utils.log("ERROR: no chat_id", req.body);
    }
  } catch (e) {
    utils.log("ERROR", e);
  }
})


function do_query_close(bot_token, id) {
  const bot = bots.get(bot_token);
  if (bot && id) {
      utils.log("  >>tg (callback query end)", id);
      axios.post('https://api.telegram.org/bot'+bot_token+'/answerCallbackQuery', {callback_query_id:id})
           .then( res   => utils.log('  <<tg (callback query end) ok', res.status))
           .catch(error => utils.log('  <<tg (callback query end) error', error));
  }
}


//const timers = {}; // {<bot_token>: {<chat_id>:[]}, ...} //список таймеров, которые были запущены в чатах по команде timer:XX

function do_check_timers(bot_token, chat_id) {
      const bot = bots.get(bot_token);
      let wf_step_id = chats.get(bot_token, chat_id, 'wf_step_id');
      let wf_step = bot.wf.filter(itm => itm['id'] === wf_step_id)[0] || {};
      let handlerMap = wf_step.on || {};
      let keyArray = Object.keys(handlerMap).filter( key => key.startsWith('timer:'));
      //stop all timer from prev wf step and start timer from current wf step
      timers.stopAllChatTimersAndStartNew(bot_token, chat_id, keyArray, (bot_token, chat_id, key) => {
        do_command(key, chat_id, bot_token)
      });
}


async function do_command(command, chat_id, bot_token, loopCounter) {
    loopCounter = loopCounter || 0;
    utils.log(`[chat_id:${chat_id}]`, 'command', command, (loopCounter>0?'loop='+loopCounter:''));

    //для предотвращения бесконечного зацикливания, считаем циклы и после 10 отправляем сообщение и ничего не делаем
    if (loopCounter == 10) {
      do_action([{send:{text:'Too many loops'}}], bot_token, chat_id);
      chats.addHistory(bot_token, chat_id, {command:'break_loops', msg:'', ts:Date.now()});
      return Promise.reject('too many loops');
    }

    //сохраняем команду в истории
    chats.addHistory(bot_token, chat_id, {command, msg:'', ts:Date.now()});

    let next_command;

    const bot = bots.get(bot_token);
    const wf_step_id = chats.get(bot_token, chat_id, 'wf_step_id');
    const wf_step = bot.wf.filter(itm => itm['id'] === wf_step_id)[0] || {};
    const actions = {...(bot.on || {}), ...(wf_step.on || {}) }
    const action = actions[command];
    if (action) {
      try {
        const wf_step_changed = await do_action(action, bot_token, chat_id);
        if (wf_step_changed) {
          do_check_timers(bot_token, chat_id); //запустим таймеры, если они есть в новом шаге
          next_command = "enter";
        }
      } catch (e) {
        utils.log(`[chat_id:${chat_id}]`, 'ACTION ERROR', e);
        next_command = "error"; //если ошибка в actions, то глобальное событие
      }
    } else {
      utils.log(`[chat_id:${chat_id}]`, 'action not found for command', command);
      //если хэндлер не найден, то глобальное событие
      //(если, конечно, это не самый первый шаг - msg:/start)
      //(и не нажатие на кнопку - msg:answer-X)
      //(и не внешнее событие - external:X)
      if (command !== 'msg:/start' && !command.startsWith('msg:answer-') && !command.startsWith('external:') && bot.wf_default_answer) {
        next_command = "unknown";
      }
    }

    if (next_command) {
      await do_command(next_command, chat_id, bot_token, loopCounter++);
    }
}


function do_apply_context(text, context) {
  Object.keys(context).forEach( key => {
    const re = new RegExp('\\$\\{'+key+'\\}', 'g');
    text = text.replace(re, context[key]);
  })
  return text;
}


function do_action(actionArray, bot_token, chat_id) {
  let wf_step_changed = false;

  let ret = Promise.resolve();
  actionArray.forEach(async (action) => {
    const actionName = Object.keys(action)[0];

    if (actionName === "goto") wf_step_changed = true;

    const value = action[actionName];
    if (actions[actionName]) {
      utils.log(`[chat_id:${chat_id}]`, 'action', actionName, value);
      ret = ret.then(() => actions[actionName](bot_token, chat_id, value));
    } else {
      utils.log(`[chat_id:${chat_id}]`, 'ERROR: unknown action', actionName, value);
    }
  })

  return ret.then(() => wf_step_changed);
}


const actions = {}

actions.goto = (bot_token, chat_id, value) => {
  chats.set(bot_token, chat_id, 'wf_step_id', value);
}

actions.send = (bot_token, chat_id, msg) => {
    msg.text = do_apply_context(msg.text, chats.get(bot_token, chat_id, 'context'));

    utils.log('  >>tg', msg);
    axios.post('https://api.telegram.org/bot'+bot_token+'/sendMessage', { chat_id: chat_id, ...msg})
         .then(res    => {
           utils.log('  <<tg (bot message) ok', res.status)
           msg.id = get(res.data, "result.message_id");
           msg.status = "sent";
         })
         .catch(error => {
           utils.log('  <<tg (bot message) error', error.response.data)
           msg.status = "error";
           msg.error = get(error, "response.data");
         })
         .then( () => {
           //сохраняем команду и сообщение пользователю в истории
           chats.addHistory(bot_token, chat_id, {command:"", msg, ts:Date.now()});
         })
}

actions.deleteMsg = (bot_token, chat_id, value) => {
  value = value || "";
  const chat = chats.get(bot_token, chat_id) || {};

  if (value.toLowerCase() === "prev") {
    let msg;
    for (let i=chat.history.length-1; (i>=0) && (typeof msg != 'object'); i--) {
      msg = chat.history[i].msg;
      if (msg.deleted == true) msg = undefined;
    }
    if (msg && msg.id) delete_message(bot_token, chat_id, msg.id);
  } 
  if (value.toLowerCase() === "all") {
    const ids = (chat.history || [])
                .filter( itm => !!get(itm, "msg.id") && !get(itm, "msg.deleted"))
                .map(itm => get(itm, "msg.id"));
console.log('ids', ids);
    ids.forEach( id => {
      delete_message(bot_token, chat_id, id);
    })
  }
}

actions.get_trial_vpn_link = (bot_token, chat_id, value) => {
  if (!chats.get(bot_token, chat_id, 'context.trial_vpn_link')) {
    utils.log('  >>ovpn', OVPN_STATS_URL + '/ovpn/add', {day:value});
    return axios.post(OVPN_STATS_URL + '/ovpn/add', {day:value}, {timeout: 2000})
      .then(res => {
        utils.log('  <<ovpn (create_vpn) ok', res.data)
        chats.set(bot_token, chat_id, 'context.trial_vpn_link', res.data.url);
      })
      .catch(error => {
        utils.log('  <<ovpn (create_vpn) error', error)
        return Promise.reject(error); //сохраняем ошибку, чтобы не запустился следующий экшн
      });
  }
}


function delete_message(bot_token, chat_id, id) {
  utils.log(`  >>tg (delete message ${id})`);
  return axios.get(`https://api.telegram.org/bot${bot_token}/deleteMessage?chat_id=${chat_id}&message_id=${id}`)
         .then(res    => {
           utils.log(`  <<tg (delete message ${id}) ok`, res.status)
           const idx = chats.findHistoryItemWithFieldThatContains(bot_token, chat_id, 'msg.id', id, (itm) => {
             itm.msg.deleted = true;
           })
           return res;
         })
         .catch(error => {
           utils.log(`  <<tg (delete message ${id}) error`, error.response.data)
           return Promise.reject(error);
         })
}





const hooks = {}

hooks.first_connect = (bot_token, qs) => {
  const bot = bots.get(bot_token);
  const name = qs['name'];
  if (bot) {
    const chat_id = chats.findChatIdWithFieldThatContains(bot_token, 'context.trial_vpn_link', name+'.ovpn');
    if (chat_id) {
      do_command("external:first_connect", chat_id, bot_token);
    } else {
      utils.log(`[external:first_connect] chat for event '${name}' was not found.`);
    }
  }
}

hooks.expired = (bot_token, qs) => {
  const bot = bots.get(bot_token);
  const name = qs['name'];
  if (bot) {
    const chat_id = chats.findChatIdWithFieldThatContains(bot_token, 'context.trial_vpn_link', name+'.ovpn');
    if (chat_id) {
      do_command("external:expired", chat_id, bot_token);
    } else {
      utils.log(`[external:expired] chat for '${name}' was not found.`);
    }
  }
}

hooks.admin = (bot_token, qs) => {
  const bot = bots.get(bot_token);
  const chat_id = qs['chat'];
  const text = qs['text'];
  if (bot) {
    if (chat_id) {
      chats.addHistory(bot_token, chat_id, {command:'external:admin', msg:'', ts:Date.now()});
      do_action([{send:{text}}], bot_token, chat_id);
    } else {
      utils.log(`[external:admin] no chat`);
    }
  }
}


http.createServer(app).listen(SERVER_PORT);