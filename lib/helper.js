const crypto = require('crypto')

const keywrap = require('./keywrap')
const db = require('./db')

const { wrapPromise } = require('./utilities')

const KEKID_CONSTANT_1 = 'KEKID_1'

function computeKekId (kek) {
  var hash = crypto.createHash('sha1')
  hash.update(KEKID_CONSTANT_1, 'ascii')
  hash.update(kek, 'ascii')
  return '#1.' + hash.digest('hex').substring(0, 32)
}

function kidFromString (kid) {
  if (kid.indexOf('^') === 0) {
    // derive the KID using a hash
    const hash = crypto.createHash('sha1')
    hash.update(kid.slice(1), 'ascii')
    kid = hash.digest('hex').substring(0, 32)
  }

  return kid
}

function randomize (key) {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(32, function (err, random) {
      if (err) {
        return reject(err)
      }
      if (!key.kid) {
        key.kid = random.slice(0, 16).toString('hex')
      }
      if (!key.ek && !key.k) {
        key.k = random.slice(16, 32).toString('hex')
      }
      return resolve(key)
    })
  })
}

function createNewKey (kek, key) {
  return new Promise(async (resolve, reject) => {
    let theKey = key
    if (!key.kid || (!key.ek && !key.k)) {
      // we need some random values
      let [err, rand] = await wrapPromise(randomize(key))
      if (err) {
        return reject(err)
      }
      theKey = rand
    }
    let [err, result] = await wrapPromise(storeNewKey(kek, theKey))
    if (err) {
      return reject(err)
    }

    return resolve(result)
  })
}

function storeNewKey (kek, key) {
  return new Promise(async (resolve, reject) => {
    key.kid = kidFromString(key.kid)
    if (!key.ek) {
      key.ek = keywrap.wrapKey(key.k, kek).toString('hex')
      if (!key.ek) {
        return reject(new Error('Invalid Key Format'))
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
    let [err] = await wrapPromise(db.createKey(key))
    if (err) {
      return reject(err)
    }
    return resolve(key)
  })
}

module.exports = {
  kidFromString,
  createNewKey
}
