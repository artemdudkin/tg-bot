const fs = require('fs');
const CronJob = require('cron').CronJob;
const utils = require('./utils');

/**
 *
 * Data cache (saves changed data every 30 seconds)
 *
 */
const o = {}; // {name:{         // {String} data object name
              //     data,       // {Object}
              //     changed,    // {Boolean}
              //     loadError,  // {String}
              //     saveError   // {String}
              //  }, ...} 

// start job to save data every 30 seconds (if it was changed)
(new CronJob('*/30 * * * * *', function() {
  Object.keys(o).forEach(name => {
    if (o[name].changed) {
      save(name);
    }
  })
})).start();



function load(name) {
  let data = {};
  let error;

  name = name || 'unnamed';
  try {
    data = JSON.parse(fs.readFileSync('./data/'+name+'.json').toString());
    error = undefined;
    utils.log(`[data:${name}] LOADED`);
  } catch (e) {
    data = {};
    error = e;
    utils.log(`[data:${name}] *NOT* LOADED`);
    utils.log(e);
  }
  o[name] = {
    data, 
    loadError: error
  }
//  return o[name];
}


function save(name) {
  if (!o[name]) {
    utils.log(`[data:${name}] *NOT* SAVED (not found)`);
  }

  if (o[name].loadError) {
    utils.log(`[data:${name}] *NOT* SAVED (as it was not loaded)`);
    return;
  }

  try {
    let data = o[name].serialize ? o[name].serialize() : JSON.stringify(o[name].data, null, 4);
    fs.writeFileSync('./data/'+name+'.json', data);
    o[name].changed = false;
    o[name].saveError = undefined;
    utils.log(`[data:${name}] SAVED`);
  } catch (e) {
    o[name].saveError = e;
    utils.log(`[data:${name}]  *NOT* SAVED`);
    utils.log(e);
  }
}


function forceSave(name) {
  save(name);
}


function get(name) {
  if (!o[name]) load(name);
  return o[name];
}


module.exports = {
  get,
  forceSave
}