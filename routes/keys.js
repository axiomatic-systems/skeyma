const db = require('../lib/db')
const validator = require('../lib/validator')
const helper = require('../lib/helper')
const keywrap = require('../lib/keywrap')

const { wrapPromise } = require('../lib/utilities')

function register (app) {
  app.get('/keys', async (req, res) => {
    if (!validator.checkParameters(req.query)) {
      res.status(400).send({ message: 'Invalid Parameters' })
      return
    }

    let kek = req.query.kek

    let [err, keys] = await wrapPromise(db.getKeys(null, kek))

    if (err) {
      console.log(err)
      res.status(500).json(err)
      return
    }

    res.status(200).json(keys)
  })

  app.get('/keys/count', async (req, res) => {
    let [err, result] = await wrapPromise(db.getKeyCount())
    if (err) {
      res.status(500).send({ message: 'Internal Server Error' })
      return
    }
    return res.status(200).json(result)
  })

  app.get('/keys/:keyIds', async (req, res) => {
    let kids = req.params['keyIds']
    let kidSelector = kids.split(',')

    if (!kids || !kidSelector) {
      res.status(400).send({ message: 'Bad Request' })
      return
    }

    for (var i = 0; i < kidSelector.length; i++) {
      var kid = helper.kidFromString(kidSelector[i])
      if (!validator.checkKid(kid)) {
        res.status(400).send({ message: 'Invalid KID' })
        return
      }

      kidSelector[i] = kid
    }

    if (!kidSelector) {
      res.status(400).send({ message: 'Invalid KID' })
      return
    }

    let kek = req.query.kek

    let [err, keys] = await wrapPromise(db.getKeys(kidSelector, kek))
    if (err) {
      console.log(err)
      res.status(500).json(err)
    }

    if (keys && keys.length > 0) {
      if (kek) {
        for (let i = 0; i < keys.length; i++) {
          var key = keys[i]
          var unwrapped = keywrap.unwrapKey(key.ek, kek)
          if (unwrapped) {
            key.k = unwrapped.toString('hex')
          } else {
            res.status(400).send({ message: 'Incorrect KEK' })
            return
          }
          delete key.ek
          delete key.kekId
        }
      }
      res.status(200).json(keys.length === 1 ? keys[0] : keys)
    } else {
      res.status(404).send({ message: 'Not Found' })
    }
  })

  app.post('/keys', async (req, res) => {
    if (!validator.checkParameters(req.query)) {
      res.status(400).json({ message: 'Invalid Parameters' })
      return
    }
    let key
    try {
      key = JSON.parse(req.body)
      if (!validator.checkKey(key)) {
        res.status(400).send({ message: 'Invalid Key Object' })
        return
      }
    } catch (err) {
      res.status(400).send({ message: 'Invalid JSON Body' })
      return
    }

    let kek = req.query.kek
    if (!kek) {
      // no kek was passed, check that an encrypted key was supplied
      if (!key.ek) {
        res.status(400).send({ message: 'No KEK passed: ek required' })
        return
      }
    }

    let [err, result] = await wrapPromise(db.createNewKey(kek, key))
    if (err) {
      res.status(400).send({ message: 'Bad Request' })
      return
    }

    res.status(200).json(result)
  })

  app.put('/keys/:keyId', async (req, res) => {
    if (!validator.checkParameters(req.query)) {
      res.status(400).json({ message: 'Invalid Parameters' })
      return
    }
    let key
    try {
      key = JSON.parse(req.body)
      if (!validator.checkKey(key)) {
        res.status(400).send({ message: 'Invalid Key Object' })
        return
      }
    } catch (err) {
      res.status(400).send({ message: 'Invalid JSON Body' })
      return
    }

    let kid = req.params['keyId']

    if (!validator.checkKid(kid) || !validator.checkKey(key)) {
      res.status(400).send({ message: 'Invalid Parameters' })
      return
    }

    let kek = req.query.kek

    if (key.k && !key.ek) {
      if (!kek) {
        res.status(400).send({ message: 'KEK Required' })
        return
      }
      key.ek = keywrap.wrapKey(key.k, kek).toString('hex')
      if (!key.ek) {
        res.status(500).send({ message: 'Internal Server Error' })
        return
      }
    }

    let [err, result] = await wrapPromise(db.putKey(kid, key))
    if (err) {
      if (err.message === 'Not Found') {
        res.status(404).send(err.message)
      } else {
        res.status(500).send({ message: 'Internal Server Error' })
      }
    }

    res.status(200).json(result)
  })

  app.delete('/keys/:keyIds', async (req, res) => {
    let kids = req.params['keyIds']
    let kidSelector = kids.split(',')

    if (!kids || !kidSelector) {
      res.status(400).send({ message: 'Bad Request' })
      return
    }

    for (var i = 0; i < kidSelector.length; i++) {
      var kid = helper.kidFromString(kidSelector[i])
      if (!validator.checkKid(kid)) {
        res.status(400).send({ message: 'Invalid KID' })
        return
      }

      kidSelector[i] = kid
    }

    if (!kidSelector) {
      res.status(400).send({ message: 'Invalid KID' })
      return
    }

    let [err, result] = await wrapPromise(db.deleteKeys(kids))
    if (err) {
      res.status(500).send({ message: 'Internal Server Error' })
      return
    }

    res.status(200).json(result)
  })
}

module.exports = {
  register
}
