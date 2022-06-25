console.log('');
console.log('starting app');

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

//start all timers on app startup (if there are any)
timers.startAll( (bot_token, chat_id, key) => {
  do_command(key, chat_id, bot_token);
});



const SERVER_PORT = 8094;
const OVPN_STATS_URL = 'http://79.137.133.102:8094';
const SETTINGS = {SERVER_PORT, OVPN_STATS_URL}

utils.log('cwd dir == ' + process.cwd());
utils.log("config dir == ", __dirname);
utils.log('port == ' + SERVER_PORT);
utils.log('ovpn stats url == ' + OVPN_STATS_URL);

var app = express();

app.use(compression());

//static files
app.use(serveStatic('./html'));

//log request
app.use(function(req, res, next) {
  utils.log('<<', req.method, req.protocol + '://' + req.get('host') + req.originalUrl);
  next();
})

//get request body
app.use (function(req, res, next) {
    var data='';
    req.setEncoding('utf8');
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      //convert req.body to json
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


app.all('/chatList', function(req, res, next) {
  const bot_token = req.body.bot_token;
  if (bots.get(bot_token)) {
    let chatList = chats.getAll(bot_token);
    Object.keys(chatList).forEach(itm => {
      delete chatList[itm].history
      delete chatList[itm].context
    })
    res.end( JSON.stringify(chatList, null, 4));
  } else {
    res.status(404).end();
  }
})

app.all('/chat', function(req, res, next) {
  const bot_token = req.body.bot_token;
  const chat_id = req.body.chat_id;
  if (bots.get(bot_token)) {
    res.end( JSON.stringify(chats.get(bot_token, chat_id)));
  } else {
    res.status(404).end();
  }
})



app.all('/hook', async function(req, res, next) {
  //empty response - bot will answer sending its own request if needed
  res.end();

  const qs = req.query;
  const bot_token = qs['bot'];
  const hookName = qs['hook'];

  let hookFunc;
  try { hookFunc = require(`./hooks/${hookName}`);} catch (e) {}

  if (hookFunc) {
    const bot = bots.get(bot_token);
    if (bot) {
      let result = hookFunc(bot_token, qs, SETTINGS, chats, utils.log);
      if (result.actions) {
        chats.addHistory(bot_token, result.chat_id, {command:`external:${hookName}`, ts:Date.now()});
        do_actions(result.actions, bot_token, result.chat_id);
      }
      if (result.command) do_command(`external:${result.command}`, result.chat_id, bot_token);
    }
  } else {
    utils.log(`hook ${name} not found`);
  }
})

app.all('/message', async function(req, res, next) {
  //empty response - bot will answer sending its own request if needed
  res.end();

  const qs = req.query;
  const bot_token = qs['bot'];

  //in any case, lets complete callback_query
  const callback_query_id = get(req.body, 'callback_query.id');
  do_query_close(bot_token, callback_query_id);

  //processing the command that came from the user
  const bot = bots.get(bot_token);
  const chat_id = get(req.body, 'message.chat.id') 
                  || get(req.body, 'edited_message.chat.id') 
                  || get(req.body, 'callback_query.message.chat.id') || undefined;
  const command = 'msg:' + (get(req.body, 'callback_query.data') 
                            || get(req.body, 'message.text') 
                            || get(req.body, 'edited_message.text')) ;
  try {
    if (bot && chat_id) {
      //save user data at the very first time
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
    chats.addHistory(bot_token, chat_id, {command, msg:'', ts:Date.now()});

    loopCounter = loopCounter || 0;
    utils.log(`[chat_id:${chat_id}]`, 'command', command, (loopCounter>0?'loop='+loopCounter:''));

    //для предотвращения бесконечного зацикливания, считаем циклы и после 10 отправляем сообщение и ничего не делаем
    if (loopCounter == 10) {
      do_actions([{send:{text:'Too many loops'}}], bot_token, chat_id);
//      chats.addHistory(bot_token, chat_id, {command:'break_loops', msg:'', ts:Date.now()});
      return Promise.reject('too many loops');
    }

    let next_command;

    const bot = bots.get(bot_token);
    const wf_step_id = chats.get(bot_token, chat_id, 'wf_step_id');
    const wf_step = bot.wf.filter(itm => itm['id'] === wf_step_id)[0] || {};
    const handlers = {...(bot.on || {}), ...(wf_step.on || {}) }
    const handler = handlers[command];
    if (handler) {
      try {
        const wf_step_changed = await do_actions(handler, bot_token, chat_id);
        if (wf_step_changed) {
          do_check_timers(bot_token, chat_id); //запустим таймеры, если они есть в новом шаге
          next_command = "enter";
        }
      } catch (e) {
        utils.log(`[chat_id:${chat_id}]`, 'HANDLER ERROR', e);
        next_command = "error"; //если ошибка в actions, то глобальное событие
      }
    } else {
      utils.log(`[chat_id:${chat_id}]`, 'handler not found for command', command);
      //если хэндлер не найден, то глобальное событие
      //(если, конечно, это не самый первый шаг - msg:/start)
      //(и не нажатие на кнопку - msg:answer-X)
      //(и не внешнее событие - external:X)
      if (command !== 'msg:/start' && !command.startsWith('msg:answer-') && !command.startsWith('external:')) {
        next_command = "unknown";
      }
    }

    if (next_command) {
      await do_command(next_command, chat_id, bot_token, loopCounter++);
    }
}


function do_actions(actionArray, bot_token, chat_id) {
  let wf_step_changed = false;

  let ret = Promise.resolve();
  actionArray.forEach(async (action, index) => {
    const actionName = Object.keys(action)[0];
    const value = action[actionName];

    if (actionName === "goto") wf_step_changed = true;

    let actionFunc;
    try { actionFunc = require(`./actions/${actionName}`);} catch (e) {}

    if (actionFunc) {
      utils.log(`[chat_id:${chat_id}]`, 'action', actionName, value);
      ret = ret
            .then(() => {
              return actionFunc(bot_token, chat_id, value, SETTINGS, chats, utils.log)
            })
            .then(() => {
              chats.addHistory(bot_token, chat_id, {command:'', action:actionName, msg:value, ts:Date.now()});
            })
    } else {
      utils.log(`[chat_id:${chat_id}]`, 'ERROR: unknown action', actionName, value);
    }
  })

  return ret.then(() => wf_step_changed);
}


http.createServer(app).listen(SERVER_PORT);