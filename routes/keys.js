const db = require('../lib/db')

const { wrapPromise } = require('../lib/utilities')

function register (app) {
  app.get('/keys', async (req, res) => {
    let kek = req.query.kek
    let [err, keys] = await wrapPromise(db.getKeys(null, kek))

    if (err) {
      console.log(err)
      res.status(500).json(err)
    }

    res.status(200).json(keys)
  })
}

module.exports = {
  register
}
