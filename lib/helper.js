const types = require('./types')

function httpErrorResponse (response, statusCode, errorCode, errorMessage) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', types.JSON_CONTENT_TYPE)
  response.end('{ "code":' + errorCode + ', "message":"' + errorMessage + '"}')
}

function httpInternalErrorResponse (response) {
  httpErrorResponse(response, 500, types.ERR_INTERNAL, 'Internal Server Error')
}

module.exports = {
  httpErrorResponse,
  httpInternalErrorResponse
}
