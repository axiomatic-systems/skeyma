var keywrap = require('./../lib/keywrap.js')

var kekHex = '000102030405060708090A0B0C0D0E0F'
var keyHex = '00112233445566778899AABBCCDDEEFF'

var wrappedKey = keywrap.wrapKey(keyHex, kekHex)
console.log(wrappedKey)
var unwrappedKey = keywrap.unwrapKey(wrappedKey, kekHex)
console.log(unwrappedKey)
