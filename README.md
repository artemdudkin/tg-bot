# tg-bot
Proof-of-concept telegram bots platform.

## Bot configuration
Look at `data/bots.json` - it is object of <bot_token>:<bot_description> pairs. You can create telegram bot with [botFather](https://core.telegram.org/bots#6-botfather) and obtain <bot_token> there (it is 46-letter string).

The main part of <bot_description> is `wf` section. Bot is [final-state machine](https://en.wikipedia.org/wiki/Finite-state_machine), and `wf` contains array of bot states.

Every bot state have two fields: `id` and `on`, which means array of <bot_event>:<bot_reaction> pairs. Event can be message from user for instance, and reaction can be array of actions like `goto state 1` or send message to user.
  
Possible events: msg:XXX, enter, error, unknown, timer:YYY, external:ZZZ.

Possible actions: goto, send, deleteMsg (and one extension 'get_trial_vpn_link' to demonstrate work with external services).

Also there is global `on` section wich participates in event handling among with `on` section of current state of bot.

## Events
`msg:XXX` fires on message from user. At least one message from user will be recieved, it is '/start', so there should be `msg:/start` event handling at global 'on' section. You can join several messages (divided bt semicolon) at one event description, for instance, 'msg:Payment;payment', which means 'if user sent "Payment" or "payment" then ...' (events are case-sensitive by the way).

`enter`  fires after transition to state (after 'goto' action). So hello-world-bot (that just sends 'hello world' message to user after clicked '/start') will be like this
```json
  "1234567890:ABCdeFGhijKlMnOpqRSTuvwXyz-i7qrTsA4" : {
    "on": {
      "msg:/start": [{"goto":"0"}],
    },
    "wf": [{
      "id":"0",
      "on" : {
        "enter": [{"send": {"text" : "hello world"}}]
      }
    }]  
  }
```

`error` and `unknown` fires on error and unknown event respectively (and can be omitted for beginners).

`timer:60000` fires after 60 seconds after transition to state (after 'goto' action).

`timer:2022-06-14-23-33-00` fires at mentioned date or immediately if mentioned date is in the past.

`external:ZZZ` fires after webhook of name 'ZZZ' was recieved. Look at 'hooks' folder for more details.

## Actions
`goto` will transfere bot to another state.

`send` will send message to user, according to [sendMessage](https://core.telegram.org/bots/api#sendmessage) bot API method.

`deleteMsg` can recieve one of two values: 'prev' or 'all'. 'Prev' will delete previous bot message, while 'all' will delete all sent bot messages.

`get_trial_vpn_link` gets link from external service like [artemdudkin/ovpn-stats](https://github.com/artemdudkin/ovpn-stats) and put it as `trial_vpn_link` to the `chat context` so you can use this link afterwards to send it to user like this
```json
    {
      "id":"1",
      "on" : {
        "enter": [{"send":{
          "text" : "You should download OpenVPN Connect app, and import this file\n\n ${trial_vpn_link}"}
        }],
        "timer:1200000" : [{"send":{"text":"If you cannot connect please contact @bot_support"}}]
      }
    }
```

## Chats
All user interaction history saved to `data/chats.json`, so you can look through it via web interface. 

Also, you can see all users that started comunication with bot.

Also, you can send message to every user as admin (from web interface).
