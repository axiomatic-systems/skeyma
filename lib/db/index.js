const config = require('config')
const sqlite = require('./sqlite')

// You can add implementation for database here
console.log(`Using "${config.db.type}" as database backend ...`)

function getDB () {
  switch (config.db.type.toLowerCase()) {
    case 'sqlite':
      return sqlite
    default:
      return null
  }
}

module.exports = getDB()
