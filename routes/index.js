const home = require('./home')
const keys = require('./keys')

function register (app) {
  home.register(app)
  keys.register(app)
}

module.exports = {
  register
}
