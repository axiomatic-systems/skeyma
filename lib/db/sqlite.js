const config = require('config')
const sqlite3 = require('sqlite3')
const results = require('../results')
const keywrap = require('../keywrap')

const db = new sqlite3.Database(config.db.sqlite.connectionString)

db.on('error', function (err) {
  console.error('CANNOT OPEN DB')
  console.error(err)
})

const createKey = function (key, callback) {
  const params = {
    $kid: key.kid,
    $ek: key.ek,
    $kekId: key.kekId,
    $info: key.info,
    $contentId: key.contentId,
    $expiration: null
  }
  if (key.expiration) {
    if (typeof key.expiration === 'string') {
      try {
        const date = new Date(key.expiration).getTime() / 1000
        if (!isNaN(date)) {
          params.$expiration = date
        }
      } catch (err) {

      }
    }
  }
  db.run('INSERT INTO Keys (kid, ek, kekId, info, contentId, expiration, lastUpdate) VALUES ($kid, $ek, $kekId, $info, $contentId, $expiration, strftime("%s", "now"))', params, function (err, result) {
    if (err) {
      err = mapError(err)
    }
    callback(err, result)
  })
}

const getKeyCount = function (callback) {
  db.get('SELECT COUNT(*) FROM Keys', function (err, result) {
    if (err) {
      err = mapError(err)
    }
    callback(err, result['COUNT(*)'])
  })
}

const getKeys = function (kids = null, kek = null) {
  let rows = []
  return new Promise((resolve, reject) => {
    const localProgressCallback = function (err, result) {
      if (err) {
        return reject(err)
      }
      if (Array.isArray(result)) {
        for (let i = 0; i < result.length; i++) {
          normalizeKey(result[i])
        }
      } else {
        normalizeKey(result)
      }
      if (kids && kids.length > 1) {
        // reorder the result to match the KID order
        let indexed = {}
        for (let i = 0; i < result.length; i++) {
          indexed[result[i].kid] = result[i]
        }
        let reordered = []
        for (let i = 0; i < kids.length; i++) {
          reordered[i] = indexed[kids[i]]
        }
        result = reordered
      }

      if (kek) {
        const unwrapped = keywrap.unwrapKey(result.ek, kek)
        if (unwrapped) {
          result.k = unwrapped.toString('hex')
        }
      }

      rows.push(result)

      if (kids) {
        return resolve(result)
      }
    }
    const localCompletionCallback = function (err, result) {
      console.log(`Rows: ${result} row(s)`)
      if (err) {
        return reject(err)
      }
      return resolve(rows)
    }
    if (kids) {
      db.all('SELECT * FROM Keys WHERE ' + kidPlaceholders(kids.length), kids, localProgressCallback)
    } else {
      // get all keys
      db.each('SELECT * FROM Keys', localProgressCallback, localCompletionCallback)
    }
  })
}

const putKey = function (kid, key, callback) {
  let sql = []
  let params = []
  if (key.ek) {
    sql.push('ek = ?')
    params.push(key.ek)
  }
  if (key.kekId !== undefined) {
    sql.push(' kekId = ?')
    params.push(key.kekId)
  }
  if (key.info !== undefined) {
    sql.push(' info = ?')
    params.push(key.info)
  }
  if (key.contentId !== undefined) {
    sql.push(' contentId = ?')
    params.push(key.contentId)
  }
  if (sql.length === 0) {
    console.log('nothing to update')
    // TODO: Fix Response
    // helper.httpErrorResponse(response, 400, ERR_INVALID_PARAMETERS, 'invalid parameters')
    return
  }
  params.push(kid)
  db.run('UPDATE Keys SET ' + sql.join(',') + ' WHERE kid = ?', params, function (err, result) {
    if (err) {
      err = mapError(err)
    } else {
      if (db.changes === 0) {
        err = results.NOT_FOUND
      }
    }
    callback(err, result)
  })
}

const deleteKeys = function (kids, callback) {
  db.run('DELETE FROM Keys WHERE ' + kidPlaceholders(kids.length), kids, function (err, result) {
    if (err) {
      err = mapError(err)
    }
    callback(err, result)
  })
}

const mapError = function mapError (err) {
  console.log('SQLite error:', err)
  switch (err.errno) {
    case sqlite3.CONSTRAINT:
      return results.CONSTRAINT
    default:
      return results.FAILURE
  }
}

const kidPlaceholders = function kidPlaceholders (kidCount) {
  const placeholders = []
  for (let i = 0; i < kidCount; i++) {
    placeholders[i] = 'kid = ?'
  }
  return placeholders.join(' OR ')
}

const normalizeKey = function normalizeKey (key) {
  for (let field in key) {
    if (key.hasOwnProperty(field)) {
      if (key[field] === null) {
        delete key[field]
      }
    }
  }
  if (key.expiration !== undefined) {
    try {
      key.expiration = new Date(1000 * key.expiration).toISOString()
    } catch (err) {
      delete key.expiration
    }
  }
  try {
    key.lastUpdate = new Date(1000 * key.lastUpdate).toISOString()
  } catch (err) {
    delete key.lastUpdate
  }
}

module.exports = {
  createKey,
  getKeyCount,
  getKeys,
  putKey,
  deleteKeys
}
