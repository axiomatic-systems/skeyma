const isHex = function isHex (str) {
  for (var i = 0; i < str.length; i++) {
    var c = str[i]
    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
      return false
    }
  }
  return true
}

const checkKey = function checkKey (key) {
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

const checkKid = function checkKid (kid) {
  if (!isHex(kid) || kid.length !== 32) {
    return false
  }
  return true
}

const checkParameters = function checkParameters (params) {
  if (params.kek) {
    if (params.kek.length !== 32) {
      return false
    }
  }

  return true
}

module.exports = {
  isHex,
  checkKey,
  checkKid,
  checkParameters
}
