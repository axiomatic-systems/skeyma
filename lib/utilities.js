function wrapPromise (promise) {
  return new Promise((resolve) => {
    promise.then(r => {
      return resolve([null, r])
    }).catch(e => {
      return resolve([e])
    })
  })
}

module.exports = {
  wrapPromise
}
