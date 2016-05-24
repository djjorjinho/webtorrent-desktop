// The Cast module talks to Airplay and Chromecast
// * Modifies state when things change
// * Starts and stops casting, provides remote video controls
module.exports = {
  init,
  open,
  close,
  play,
  pause,
  seek,
  setVolume,
  setRate,
  selectDevice
}

var airplay = require('airplay-js')
var chromecasts = require('chromecasts')()
var dlnacasts = require('dlnacasts')()

var config = require('../../config')

// App state. Cast modifies state.playing and state.errors in response to events
var state

// Callback to notify module users when state has changed
var update

// setInterval() for updating cast status
var statusInterval = null

// Start looking for cast devices on the local network
function init (appState, callback) {
  state = appState
  update = callback

  state.devices.chromecast = chromecastPlayer()
  state.devices.dlna = dlnaPlayer()
  state.devices.airplay = airplayPlayer(browser)

  // Listen for devices: Chromecast, DLNA and Airplay
  chromecasts.on('update', function (device) {
    // TODO: how do we tell if there are *no longer* any Chromecasts available?
    // From looking at the code, chromecasts.players only grows, never shrinks
    state.devices.chromecast.addDevice(device)
  })

  dlnacasts.on('update', function (device) {
    state.devices.dlna.addDevice(device)
  })

  var browser = airplay.createBrowser()
  browser.on('deviceOn', function (device) {
    state.devices.airplay.addDevice(device)
  }).start()
}

// chromecast player implementation
function chromecastPlayer () {
  var ret = {
    device: null,
    addDevice,
    getDevices,
    open,
    play,
    pause,
    stop,
    status,
    seek,
    volume
  }
  return ret

  function getDevices () {
    return chromecasts.players
  }

  function addDevice (device) {
    device.on('error', function (err) {
      if (device !== ret.device) return
      state.playing.location = 'local'
      state.errors.push({
        time: new Date().getTime(),
        message: 'Could not connect to Chromecast. ' + err.message
      })
      update()
    })
    device.on('disconnect', function () {
      if (device !== ret.device) return
      state.playing.location = 'local'
      update()
    })
  }

  function open () {
    var torrentSummary = state.saved.torrents.find((x) => x.infoHash === state.playing.infoHash)
    ret.device.play(state.server.networkURL, {
      type: 'video/mp4',
      title: config.APP_NAME + ' - ' + torrentSummary.name
    }, function (err) {
      if (err) {
        state.playing.location = 'local'
        state.errors.push({
          time: new Date().getTime(),
          message: 'Could not connect to Chromecast. ' + err.message
        })
      } else {
        state.playing.location = 'chromecast'
      }
      update()
    })
  }

  function play (callback) {
    ret.device.play(null, null, callback)
  }

  function pause (callback) {
    ret.device.pause(callback)
  }

  function stop (callback) {
    ret.device.stop(callback)
  }

  function status () {
    ret.device.status(function (err, status) {
      if (err) return console.log('error getting %s status: %o', state.playing.location, err)
      state.playing.isPaused = status.playerState === 'PAUSED'
      state.playing.currentTime = status.currentTime
      state.playing.volume = status.volume.muted ? 0 : status.volume.level
      update()
    })
  }

  function seek (time, callback) {
    ret.device.seek(time, callback)
  }

  function volume (volume, callback) {
    ret.device.volume(volume, callback)
  }
}

// airplay player implementation
function airplayPlayer (browser) {
  var ret = {
    device: null,
    addDevice,
    getDevices,
    open,
    play,
    pause,
    stop,
    status,
    seek,
    volume
  }
  return ret

  function addDevice () {}

  function getDevices () {
    return browser ? browser.getDevices() : []
  }

  function open () {
    ret.device.play(state.server.networkURL, 0, function (res) {
      if (res.statusCode !== 200) {
        state.playing.location = 'local'
        state.errors.push({
          time: new Date().getTime(),
          message: 'Could not connect to AirPlay.'
        })
      } else {
        state.playing.location = 'airplay'
      }
      update()
    })
  }

  function play (callback) {
    ret.device.rate(1, callback)
  }

  function pause (callback) {
    ret.device.rate(0, callback)
  }

  function stop (callback) {
    ret.device.stop(callback)
  }

  function status () {
    ret.device.status(function (status) {
      state.playing.isPaused = status.rate === 0
      state.playing.currentTime = status.position
      // TODO: get airplay volume, implementation needed. meanwhile set value in setVolume
      // According to docs is in [-30 - 0] (db) range
      // should be converted to [0 - 1] using (val / 30 + 1)
      update()
    })
  }

  function seek (time, callback) {
    ret.device.scrub(time, callback)
  }

  function volume (volume, callback) {
    // TODO remove line below once we can fetch the information in status update
    state.playing.volume = volume
    volume = (volume - 1) * 30
    ret.device.volume(volume, callback)
  }
}

// DLNA player implementation
function dlnaPlayer (player) {
  var ret = {
    device: null,
    addDevice,
    getDevices,
    open,
    play,
    pause,
    stop,
    status,
    seek,
    volume
  }
  return ret

  function getDevices () {
    return dlnacasts.players
  }

  function addDevice (device) {
    device.on('error', function (err) {
      if (device !== ret.device) return
      state.playing.location = 'local'
      state.errors.push({
        time: new Date().getTime(),
        message: 'Could not connect to DLNA. ' + err.message
      })
      update()
    })
    device.on('disconnect', function () {
      if (device !== ret.device) return
      state.playing.location = 'local'
      update()
    })
  }

  function open () {
    var torrentSummary = state.saved.torrents.find((x) => x.infoHash === state.playing.infoHash)
    ret.device.play(state.server.networkURL, {
      type: 'video/mp4',
      title: config.APP_NAME + ' - ' + torrentSummary.name,
      seek: state.playing.currentTime > 10 ? state.playing.currentTime : 0
    }, function (err) {
      if (err) {
        state.playing.location = 'local'
        state.errors.push({
          time: new Date().getTime(),
          message: 'Could not connect to DLNA. ' + err.message
        })
      } else {
        state.playing.location = 'dlna'
      }
      update()
    })
  }

  function play (callback) {
    ret.device.play(null, null, callback)
  }

  function pause (callback) {
    ret.device.pause(callback)
  }

  function stop (callback) {
    ret.device.stop(callback)
  }

  function status () {
    ret.device.status(function (err, status) {
      if (err) return console.log('error getting %s status: %o', state.playing.location, err)
      state.playing.isPaused = status.playerState === 'PAUSED'
      state.playing.currentTime = status.currentTime
      state.playing.volume = status.volume.level
      update()
    })
  }

  function seek (time, callback) {
    ret.device.seek(time, callback)
  }

  function volume (volume, callback) {
    ret.device.volume(volume, function (err) {
      // quick volume update
      state.playing.volume = volume
      callback(err)
    })
  }
}

// Start polling cast device state, whenever we're connected
function startStatusInterval () {
  statusInterval = setInterval(function () {
    var player = getPlayer()
    if (player) player.status()
  }, 1000)
}

function open (location) {
  if (state.playing.location !== 'local') {
    throw new Error('You can\'t connect to ' + location + ' when already connected to another device')
  }

  var player = getPlayer(location)
  var devices = player ? player.getDevices() : []
  if (devices.length === 0) throw new Error('No ' + location + ' devices available')

  // Show a menu
  state.devices.castMenu = {location, devices}

  /* if (devices.length === 1) {
    // Start casting to the only available Chromecast, Airplay, or DNLA device
    openDevice(location, devices[0])
  } else {
    // Show a menu
  } */
}

function selectDevice (index) {
  var {location, devices} = state.devices.castMenu

  // Start casting
  var player = getPlayer(location)
  player.device = devices[index]
  player.open()

  // Poll the casting device's status every few seconds
  startStatusInterval()

  // Show the Connecting... screen
  state.devices.castMenu = null
  state.playing.location = location + '-pending'
  update()
}

// Stops casting, move video back to local screen
function close () {
  var player = getPlayer()
  if (player) {
    player.stop(stoppedCasting)
    clearInterval(statusInterval)
  } else {
    stoppedCasting()
  }
}

function stoppedCasting () {
  state.playing.location = 'local'
  state.playing.jumpToTime = state.playing.currentTime
  update()
}

function getPlayer (location) {
  if (location) {
    return state.devices[location]
  } else if (state.playing.location === 'chromecast') {
    return state.devices.chromecast
  } else if (state.playing.location === 'airplay') {
    return state.devices.airplay
  } else if (state.playing.location === 'dlna') {
    return state.devices.dlna
  } else {
    return null
  }
}

function play () {
  var player = getPlayer()
  if (player) player.play(castCallback)
}

function pause () {
  var player = getPlayer()
  if (player) player.pause(castCallback)
}

function setRate (rate) {
  var player
  var result = true
  if (state.playing.location === 'chromecast') {
    // TODO find how to control playback rate on chromecast
    castCallback()
    result = false
  } else if (state.playing.location === 'airplay') {
    player = state.devices.airplay
    player.rate(rate, castCallback)
  } else {
    result = false
  }
  return result
}

function seek (time) {
  var player = getPlayer()
  if (player) player.seek(time, castCallback)
}

function setVolume (volume) {
  var player = getPlayer()
  if (player) player.volume(volume, castCallback)
}

function castCallback () {
  console.log('%s callback: %o', state.playing.location, arguments)
}
