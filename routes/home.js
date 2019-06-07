function register (app) {
  app.get('/', (req, res) => {
    let data = {
      status: 'Server is running ...',
      time: new Date()
    }
    res.status(200).json(data)
  })
}

module.exports = {
  register
}
