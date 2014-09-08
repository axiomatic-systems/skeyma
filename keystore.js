var http      = require('http');
var url       = require('url');
var path      = require('path');
var crypto    = require('crypto');
var send      = require('send');
var accesslog = require('access-log');
var options   = require('commander');
var keywrap   = require('./lib/keywrap.js');
var results   = require('./lib/results.js');
var JSON_CONTENT_TYPE = "application/json";

var ERR_INTERNAL           = 1;
var ERR_INVALID_PARAMETERS = 2;
var ERR_INVALID_SYNTAX     = 3;
var ERR_KID_ALREADY_EXISTS = 4;
var ERR_INCORRECT_KEK      = 5;

// parse the command line options
options
    .version('1.0.0')
    .option('-p, --port [port]', 'Listen on port number [port] (default 8000)', 8000)
    .option('-l, --log-level [log-level]', 'Logging level (between 0 and 10, default=1)', 1)
    .option('-o, --log-output [log-output-file]', 'Log output file name (default=stdout)')
    .option('-r, --root [url-root]', 'Root URL path at which the API is exposed (default=/)', '/')
    .option('-b, --db [module:params]', 'Database configuration (default=sqlite3:keys.db)', 'sqlite3:keys.db')
    .option('-d, --debug', 'Debug mode')
    .parse(process.argv);
options.port = parseInt(options.port);
options.logLevel = parseInt(options.logLevel);

function httpErrorResponse(response, statusCode, errorCode, errorMessage) {
    response.statusCode = statusCode;
    response.setHeader('Content-Type', JSON_CONTENT_TYPE);
    response.end('{ "code":'+errorCode+', "message":"'+errorMessage+'"}');
}

function kidFromString(kid) {
    if (kid.indexOf('^') == 0) {
        // derive the KID using a hash
        var hash = crypto.createHash('sha1');
        hash.update(kid.slice(1), "ascii");
        kid = hash.digest('hex').substring(0, 32);
    }

    return kid;
}

function parseKidList(kids, response) {
    var kid_selector = kids.split(',');
    for (var i=0; i<kid_selector.length; i++) {
        var kid = kidFromString(kid_selector[i]);
        if (!checkKid(kid)) {
            httpErrorResponse(response, 400, ERR_INVALID_PARAMETERS, 'invalid kid');
            return null;
        }

        kid_selector[i] = kid;
    }
    return kid_selector;
}

var KEKID_CONSTANT_1 = "KEKID_1";
function computeKekId(kek) {
    var hash = crypto.createHash('sha1');
    hash.update(KEKID_CONSTANT_1, "ascii");
    hash.update(kek, "ascii");
    return "#1."+hash.digest('hex').substring(0, 32);
}

function storeNewKey(response, kek, key) {
    key.kid = kidFromString(key.kid);
    if (!key.ek) {
        key.ek = keywrap.wrapKey(key.k, kek).toString('hex');
        if (!key.ek) {
            httpErrorResponse(response, 500, ERR_INTERNAL, "Internal Error");
            return;
        }
    }
    if (key.kekId == undefined) {
        if (kek) {
            // compute the KEK ID from the kek itself
            key.kekId = computeKekId(kek);
        } else {
            // no KEK ID
            key.kekId = '';
        }
    }
    db.createKey(key, function(err, result) {
        if (err) {
            console.log('createKey error:', err);
            if (err === results.CONSTRAINT) {
                getKeys(response, key.kid, kek, false);
            } else {
                httpErrorResponse(response, 500, ERR_INTERNAL, "Internal Error");
            }
            return;
        }
        response.statusCode = 201;
        response.setHeader('Location', '/keys/'+key.kid);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(key));
    });
}

function createNewKey(response, kek, key) {
    if (!key.kid || (!key.ek && !key.k)) {
        // we need some random values
        crypto.randomBytes(32, function(ex, random) {
            if (ex) throw ex;
            if (!key.kid) {
                key.kid = random.slice(0, 16).toString('hex');
            }
            if (!key.ek && !key.k) {
                key.k = random.slice(16, 32).toString('hex');
            }
            storeNewKey(response, kek, key);
        });
    } else {
        storeNewKey(response, kek, key);
    }
}

function getAllKeys(response, kek) {
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    response.write('[');
    var keyCount = 0;
    db.getKeys(null, function(err, key) {
        if (key) {
            if (kek) {
                // try to unwrap the key
                var unwrapped = keywrap.unwrapKey(key.ek, kek);
                if (!unwrapped) return;
                key.k = unwrapped.toString('hex');
            }
            var sep = keyCount?',':'';
            response.write(sep+JSON.stringify(key));
            ++keyCount;
        }
    }, function() {
        response.write(']');
        response.end();
    });
}

function getKeys(response, kids, kek, valueOnly) {
    var kid_selector = parseKidList(kids, response);
    if (!kid_selector) {
        return;
    }
    db.getKeys(kid_selector, function(err, keys) {
        if (err) {
            console.log(err);
            httpErrorResponse(response, 500, ERR_INTERNAL, "internal server error");
            return;
        }
        if (keys && keys.length > 0) {
            if (kek) {
                for (var i=0; i<keys.length; i++) {
                    var key = keys[i];
                    var unwrapped = keywrap.unwrapKey(key.ek, kek);
                    if (unwrapped) {
                        key.k = unwrapped.toString('hex');
                    } else {
                        httpErrorResponse(response, 400, ERR_INCORRECT_KEK, "incorrect KEK");
                        return;
                    }
                    delete key.ek;
                    delete key.kekId;
                }
            }
            response.statusCode = 200;
            if (valueOnly) {
                response.setHeader('Content-Type', 'text/plain');
                var result = '';
                var separator = '';
                for (var i=0; i<keys.length; i++) {
                    result += separator + (keys[i].k?keys[i].k:'#'+keys[i].ek);
                    separator = ',';
                }
                response.end(result)
            } else {
                response.setHeader('Content-Type', JSON_CONTENT_TYPE);
                if (keys.length == 1) {
                    response.end(JSON.stringify(keys[0]));
                } else {
                    response.end(JSON.stringify(keys));
                }
            }
        } else {
            response.statusCode = 400;
            response.end('Not Found');
        }
    }, null);
}

function deleteKey(response, kids) {
    var kid_selector = parseKidList(kids, response);
    if (!kid_selector) {
        return;
    }
    db.deleteKeys(kids, function(err, result) {
        if (err) {
            console.log(err);
            httpErrorResponse(response, 500, ERR_INTERNAL, "Internal Error");
            return;
        }
        response.statusCode = 200;
        response.end();
    });
}

function updateKey(response, kid, key, kek) {
    kid = kidFromString(kid);

    if (!checkKid(kid) || !checkKey(key)) {
        httpErrorResponse(response, 400, ERR_INVALID_PARAMETERS, 'invalid parameters');
        return;
    }
    if (key.k && !key.ek) {
        if (!kek) {
            httpErrorResponse(response, 400, ERR_INVALID_PARAMETERS, 'kek required');
            return;
        }
        key.ek = keywrap.wrapKey(key.k, kek).toString('hex');
        if (!key.ek) {
            httpErrorResponse(response, 500, ERR_INTERNAL, "Internal Error");
            return;
        }
    }
    db.putKey(kid, key, function(err, result) {
        if (err) {
            if (err === results.NOT_FOUND) {
                response.statusCode = 404;
                response.end('Not Found');
            } else {
                httpErrorResponse(response, 500, ERR_INTERNAL, "Internal Error");
            }
            return;
        }
        response.statusCode = 200;
        response.end();
    });
}

function isHex(str) {
    return true; // TODO
}

function checkKey(key) {
    if (key.kid) {
        if (!isHex(key.kid)) return false;
    }
    if (key.k) {
        if (!isHex(key.k)) return false;
    }
    if (key.ek) {
        if (!isHex(key.ek)) return false;
    }
    return true;
}

function checkKid(kid) {
    if (!isHex(kid) || kid.length != 32) {
        return false;
    }
    return true;
}

function checkParameters(params) {
    if (params.kek) {
        if (params.kek.length != 32) {
            return false;
        }
    }

    return true;
}

function parseJsonBody(request, response, callback) {
    var body = '';
    request.on('data', function (data) {
        body += data;
    });
    request.on('end', function () {
        var key = {}
        if (body) {
            try {
                key = JSON.parse(body);
            } catch(err) {
                httpErrorResponse(response, 400, ERR_INVALID_SYNTAX, "invalid JSON body");
                return;
            }
        }
        callback(key);
    });
}

var pathExp1 = /^\/keys\/?$/i;
var pathExp2 = /^\/keys\/([^\/]+)(\/value)?\/?$/i;

var server = http.createServer(function (request, response) {
    accesslog(request, response);

    response.setHeader('Access-Control-Allow-Origin', '*');

    parsedUrl = url.parse(request.url, true);
    if (!checkParameters(parsedUrl.query)) {
        httpErrorResponse(response, 400, ERR_INVALID_PARAMETERS, 'invalid parameters');
        return;
    }

    var match;
    if (match = pathExp1.exec(parsedUrl.pathname)) {
        if (request.method == 'GET') {
            getAllKeys(response, parsedUrl.query.kek);
        } else if (request.method == 'POST') {
            parseJsonBody(request, response, function(key) {
                if (!parsedUrl.query.kek) {
                    // no kek was passed, check that an encrypted key was supplied
                    if (!key.ek) {
                        httpErrorResponse(response, 400, ERR_INVALID_PARAMETERS, "no kek passed: ek required");
                        return;
                    }
                }
                createNewKey(response, parsedUrl.query.kek, key);
            });
        } else {
            response.statusCode = 405;
            response.end('Method Not Allowed');
        }
    } else if (match = pathExp2.exec(parsedUrl.pathname)) {
        if (request.method == 'GET') {
            getKeys(response, match[1], parsedUrl.query.kek, match[2]?true:false);
        } else if (request.method == 'DELETE' && !match[2]) {
            deleteKey(response, match[1]);
        } else if (request.method == 'PUT' && !match[2]) {
            parseJsonBody(request, response, function(key) {
                updateKey(response, match[1], key, parsedUrl.query.kek);
            });
        } else {
            response.statusCode = 405;
            response.end('Method Not Allowed');
        }
    } else if (parsedUrl.pathname.indexOf('/api-docs') == 0) {
        send(request, parsedUrl.pathname.replace('/api-docs', ''))
            .root(path.join(__dirname, 'docs/api-docs'))
            .pipe(response);
    } else {
        response.statusCode = 404;
        response.end('Not Found');
    }
});

if (options.db.indexOf('sqlite3:') >= 0) {
    var db = require('./lib/db_sqlite3').openKeyDatabase(options.db.slice(8), options);
} else {
    console.error('ERROR: unknown DB type');
    process.exit(1);
}

db.on('open', function() {
    if (options.debug) {
        console.log('STARTING server on port', options.port);
    }
    server.listen(options.port);
});
db.on('error', function(err) {
    console.log('CANNOT OPEN DB');
    console.log(err);
})

