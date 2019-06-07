const http = require('http')
const url = require('url')
const crypto = require('crypto')
const accesslog = require('access-log')
const options = require('commander')
const keywrap = require('./lib/keywrap.js')
const results = require('./lib/results.js')
const helper = require('./lib/helper')
const types = require('./lib/types')
const db = require('./lib//db')

function kidFromString (kid) {
  if (kid.indexOf('^') === 0) {
    // derive the KID using a hash
    const hash = crypto.createHash('sha1')
    hash.update(kid.slice(1), 'ascii')
    kid = hash.digest('hex').substring(0, 32)
  }

  return kid
}

function parseKidList (kids, response) {
  var kidSelector = kids.split(',')
  for (var i = 0; i < kidSelector.length; i++) {
    var kid = kidFromString(kidSelector[i])
    if (!checkKid(kid)) {
      helper.httpErrorResponse(response, 400, types.ERR_INVALID_PARAMETERS, 'Invalid KID')
      return null
    }

    kidSelector[i] = kid
  }
  return kidSelector
}

var KEKID_CONSTANT_1 = 'KEKID_1'
function computeKekId (kek) {
  var hash = crypto.createHash('sha1')
  hash.update(KEKID_CONSTANT_1, 'ascii')
  hash.update(kek, 'ascii')
  return '#1.' + hash.digest('hex').substring(0, 32)
}

function storeNewKey (response, kek, key) {
  key.kid = kidFromString(key.kid)
  if (!key.ek) {
    key.ek = keywrap.wrapKey(key.k, kek).toString('hex')
    if (!key.ek) {
      helper.httpInternalErrorResponse(response)
      return
    }
  }
  if (key.kekId === undefined) {
    if (kek) {
      // compute the KEK ID from the kek itself
      key.kekId = computeKekId(kek)
    } else {
      // no KEK ID
      key.kekId = ''
    }
  }
  db.createKey(key, function (err, result) {
    if (err) {
      if (options.debug) {
        console.log('createKey error:', err)
      }
      if (err === results.CONSTRAINT) {
        getKeys(response, key.kid, kek, false)
      } else {
        helper.httpInternalErrorResponse(response)
      }
      return
    }
    response.statusCode = 201
    response.setHeader('Location', '/keys/' + key.kid)
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(key))
  })
}

function createNewKey (response, kek, key) {
  if (!key.kid || (!key.ek && !key.k)) {
    // we need some random values
    crypto.randomBytes(32, function (ex, random) {
      if (ex) throw ex
      if (!key.kid) {
        key.kid = random.slice(0, 16).toString('hex')
      }
      if (!key.ek && !key.k) {
        key.k = random.slice(16, 32).toString('hex')
      }
      storeNewKey(response, kek, key)
    })
  } else {
    storeNewKey(response, kek, key)
  }
}

function getKeyCount (response) {
  db.getKeyCount(function (err, result) {
    if (err) {
      if (options.debug) {
        console.log(err)
      }
      helper.httpInternalErrorResponse(response)
      return
    }
    response.setHeader('Content-Type', 'application/json')
    response.statusCode = 200
    response.end(JSON.stringify({ keyCount: result }))
  })
}

function getAllKeys (response, kek) {
  response.statusCode = 200
  response.setHeader('Content-Type', 'application/json')
  response.write('[')
  let keyCount = 0
  db.getKeys(null, function (err, key) {
    if (err) {
      if (options.debug) {
        console.log(err)
      }
      helper.httpInternalErrorResponse(response)
      return
    }
    if (key) {
      if (kek) {
        // try to unwrap the key
        var unwrapped = keywrap.unwrapKey(key.ek, kek)
        if (!unwrapped) return
        key.k = unwrapped.toString('hex')
      }
      var sep = keyCount ? ',' : ''
      response.write(sep + JSON.stringify(key))
      ++keyCount
    }
  }, function () {
    response.write(']')
    response.end()
  })
}

function getKeys (response, kids, kek, valueOnly) {
  var kidSelector = parseKidList(kids, response)
  if (!kidSelector) {
    return
  }
  db.getKeys(kidSelector, function (err, keys) {
    if (err) {
      if (options.debug) {
        console.log(err)
      }
      helper.httpInternalErrorResponse(response)
      return
    }
    if (keys && keys.length > 0) {
      if (kek) {
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i]
          var unwrapped = keywrap.unwrapKey(key.ek, kek)
          if (unwrapped) {
            key.k = unwrapped.toString('hex')
          } else {
            helper.httpErrorResponse(response, 400, types.ERR_INCORRECT_KEK, 'Incorrect KEK')
            return
          }
          delete key.ek
          delete key.kekId
        }
      }
      response.statusCode = 200
      if (valueOnly) {
        response.setHeader('Content-Type', 'text/plain')
        var result = ''
        var separator = ''
        for (let i = 0; i < keys.length; i++) {
          result += separator + (keys[i].k ? keys[i].k : '#' + keys[i].ek)
          separator = ','
        }
        response.end(result)
      } else {
        response.setHeader('Content-Type', helper.JSON_CONTENT_TYPE)
        if (keys.length === 1) {
          response.end(JSON.stringify(keys[0]))
        } else {
          response.end(JSON.stringify(keys))
        }
      }
    } else {
      response.statusCode = 400
      response.end('Not Found')
    }
  }, null)
}

function deleteKey (response, kids) {
  var kidSelector = parseKidList(kids, response)
  if (!kidSelector) {
    return
  }
  db.deleteKeys(kids, function (err, result) {
    if (err) {
      if (options.debug) {
        console.log(err)
      }
      helper.httpInternalErrorResponse(response)
      return
    }
    response.statusCode = 200
    response.end()
  })
}

function updateKey (response, kid, key, kek) {
  kid = kidFromString(kid)

  if (!checkKid(kid) || !checkKey(key)) {
    helper.httpErrorResponse(response, 400, types.ERR_INVALID_PARAMETERS, 'Invalid Parameters')
    return
  }
  if (key.k && !key.ek) {
    if (!kek) {
      helper.httpErrorResponse(response, 400, types.ERR_INVALID_PARAMETERS, 'KEK Required')
      return
    }
    key.ek = keywrap.wrapKey(key.k, kek).toString('hex')
    if (!key.ek) {
      helper.httpInternalErrorResponse(response)
      return
    }
  }
  db.putKey(kid, key, function (err, result) {
    if (err) {
      if (err === results.NOT_FOUND) {
        response.statusCode = 404
        response.end('Not Found')
      } else {
        helper.httpInternalErrorResponse(response)
      }
      return
    }
    response.statusCode = 200
    response.end()
  })
}

function isHex (str) {
  for (var i = 0; i < str.length; i++) {
    var c = str[i]
    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
      return false
    }
  }
  return true
}

function checkKey (key) {
  if (key.kid) {
    if (key.kid.indexOf('^') !== 0) {
      if (!isHex(key.kid)) return false
    }
  }
  if (key.k) {
    if (!isHex(key.k)) return false
  }
  if (key.ek) {
    if (!isHex(key.ek)) return false
  }
  return true
}

function checkKid (kid) {
  if (!isHex(kid) || kid.length !== 32) {
    return false
  }
  return true
}

function checkParameters (params) {
  if (params.kek) {
    if (params.kek.length !== 32) {
      return false
    }
  }

  return true
}

function parseJsonBody (request, response, callback) {
  var body = ''
  request.on('data', function (data) {
    body += data
  })
  request.on('end', function () {
    try {
      var key = {}
      if (body) {
        try {
          key = JSON.parse(body)
          if (!checkKey(key)) {
            helper.httpErrorResponse(response, 400, types.ERR_INVALID_SYNTAX, 'Invalid Key Object')
            return
          }
        } catch (err) {
          helper.httpErrorResponse(response, 400, types.ERR_INVALID_SYNTAX, 'Invalid JSON Body')
          return
        }
      }
      callback(key)
    } catch (err) {
      if (options.debug) {
        console.log(err)
      }
      helper.httpInternalErrorResponse(response)
    }
  })
}

var pathExp1 = /^\/keys\/?$/i
var pathExp2 = /^\/keys\/([^/]+)(\/value)?\/?$/i

var server = http.createServer(function (request, response) {
  try {
    accesslog(request, response)

    response.setHeader('Access-Control-Allow-Origin', '*')

    const parsedUrl = url.parse(request.url, true)
    if (!checkParameters(parsedUrl.query)) {
      helper.httpErrorResponse(response, 400, types.ERR_INVALID_PARAMETERS, 'Invalid Parameters')
      return
    }

    if (pathExp1.exec(parsedUrl.pathname)) {
      if (request.method === 'GET') {
        getAllKeys(response, parsedUrl.query.kek)
      } else if (request.method === 'POST') {
        parseJsonBody(request, response, function (key) {
          if (!parsedUrl.query.kek) {
            // no kek was passed, check that an encrypted key was supplied
            if (!key.ek) {
              helper.httpErrorResponse(response, 400, types.ERR_INVALID_PARAMETERS, 'No KEK passed: ek required')
              return
            }
          }
          createNewKey(response, parsedUrl.query.kek, key)
        })
      } else {
        response.statusCode = 405
        response.end('Method Not Allowed')
      }
    } else if (pathExp2.exec(parsedUrl.pathname)) {
      let match = pathExp2.exec(parsedUrl.pathname)
      if (request.method === 'GET') {
        getKeys(response, match[1], parsedUrl.query.kek, !!match[2])
      } else if (request.method === 'DELETE' && !match[2]) {
        deleteKey(response, match[1])
      } else if (request.method === 'PUT' && !match[2]) {
        parseJsonBody(request, response, function (key) {
          updateKey(response, match[1], key, parsedUrl.query.kek)
        })
      } else {
        response.statusCode = 405
        response.end('Method Not Allowed')
      }
    } else if (parsedUrl.pathname === '/keycount') {
      getKeyCount(response)
    } else {
      response.statusCode = 404
      response.end('Not Found')
    }
  } catch (e) {
    helper.httpInternalErrorResponse(response)
  }
})
