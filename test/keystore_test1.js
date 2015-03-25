var http  = require('http');
var https = require('https');
var url   = require('url');
var async = require('async');

function callApi(requestPath, requestMethod, requestBody, onDone, onSuccess) {
    if (Options.extraArgs) {
        if (requestPath.indexOf('?') >= 0) {
            requestPath += '&'+Options.extraArgs;
        } else {
            requestPath += '?'+Options.extraArgs;
        }
    }
    var parsedUrl = url.parse(Options.urlRoot);
    var rootPath = parsedUrl.path;
    if (rootPath.indexOf('/', rootPath.length-1) >= 0) {
        rootPath = rootPath.slice(0,-1);
    }
    var options = {
        host:   parsedUrl.hostname,
        port:   parsedUrl.port,
        path:   rootPath + requestPath,
        method: requestMethod,
        rejectUnauthorized: false
    };
    if (requestMethod === 'POST' || requestMethod == 'PUT') {
        options.headers = {
            'Content-Type': 'application/json',
            'Content-Length': requestBody.length
        }
    }

    if (Options.verbose) {
        console.log('REQUEST:', requestMethod, options.path);
        if (requestBody !== null) {
            console.log('REQUEST BODY:', requestBody);
        }
    }

    var request = (parsedUrl.protocol === 'https:' ? https : http).request(options, function(response) {
        if (Options.verbose) {
            console.log('RESPONSE:', response.statusCode, JSON.stringify(response.headers));
        }

        response.body = '';
        response.setEncoding('binary');
        response.on('data', function(chunk) {
            response.body += chunk;
        });

        response.on('end', function() {
            if (Options.verbose) {
                console.log('RESPONSE BODY:', response.body);
            }
            try {
                onSuccess(response);
                onDone(null);
            } catch (err) {
                onDone(err);
            }
        });
    }).on('error', function(err) {
        onDone(err);
    });

    if (requestBody) {
        request.write(requestBody);
    }
    request.end();
}

var Options = {
    urlRoot: process.argv[2],
    verbose: true
}

if (process.argv.length >= 4) {
    Options.extraArgs = process.argv[3];
}

function checkResponseMimeType(response) {
    if (response.headers['content-type'] !== 'application/json') {
        throw new Error('expected application/json content type');
    }
}

function checkEqual(name, a,b) {
    if (a !== b) {
        throw new Error('expected '+name+' to be "'+b+'" but got "'+a+'"');
    }
}

function checkEqualNoCase(name, a,b) {
    checkEqual(name, a.toLowerCase(), b.toLowerCase());
}

function makeTest(name, test) {
    return function(callback) {
        console.log();
        console.log('-------------------------------------');
        console.log('TEST:', name);
        try {
            test(function(err, tag) {
                if (err) {
                    console.log('### ERROR:', err);
                }
                callback();
            });
        } catch(e) {
            console.error(e);
            callback();
        }
    }
}

var kek1 = '000102030405060708090a0b0c0d0e0f';
var kek2 = 'ff0102030405060708090a0b0c0d0e0f';
var kek3 = '00112233445566778899aabbccddeeff';
var kid1 = '00112233445566778899aabbccddeeff';
var kid2 = '00112233445566778899aabbccddeefa';
var kid3 = '00112233445566778899aabbccddeefb';
var kid4 = '00112233445566778899aabbccddeefc';
var key1 = 'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf';
var key2 = '12341234123412341234123412341234';
var kid1_hash = '80ea8bc8a58f990ad1f76bc665b30bfa';

var wrapped_key2 = 'ffaf1dae9201d1adf62770dca5ddb77ad773a79369e39986'; // key2 wrapped with kek3

var keyTable = {};

var test1 = makeTest(
    'remove all keys that we are going to test with',
    function(callback) {
        async.eachSeries([kid1, kid2, kid3, kid4, kid1_hash], function(item, callback) {
            callApi('/keys/'+item, 'DELETE', null, callback, function(response) {
                console.log('KEY', item, 'deleted');
            })
        }, function(err) {
            callback(err);
        })
    });

var test2 = makeTest(
    'create new key with empty post',
    function(callback) {
        callApi('/keys?kek='+kek1, 'POST', '', callback, function(response) {
            checkResponseMimeType(response);
            checkEqual('HTTP status code', response.statusCode, 201);
            if (!response.headers.location) {
                throw new Error('Location header is missing');
            }
            var key = JSON.parse(response.body);
            keyTable[key.kid] = key.k;
        });
    });

var test3 = makeTest(
    'create new key with empty object post',
    function(callback) {
        callApi('/keys?kek='+kek1, 'POST', '{}', callback, function(response) {
            checkResponseMimeType(response);
            checkEqual('HTTP status code', response.statusCode, 201);
            if (!response.headers.location) {
                throw new Error('Location header is missing');
            }
            var key = JSON.parse(response.body);
            keyTable[key.kid] = key.k;
        });
    });

var test4 = makeTest(
    'post with a body specifying a KID that does not already exist',
    function(callback) {
        callApi('/keys?kek='+kek1, 'POST', '{"kid":"'+kid1+'"}', callback, function(response) {
            checkResponseMimeType(response);
            checkEqual('HTTP status code', response.statusCode, 201);
            if (!response.headers.location) {
                throw new Error('Location header is missing');
            }
            var key = JSON.parse(response.body);
            checkEqual('KID value', kid1, key.kid);
            keyTable[key.kid] = key.k;
        });
    });

var test5 = makeTest(
    'post with a body specifying a KID that already exists',
    function(callback) {
        callApi('/keys?kek='+kek1, 'POST', '{"kid":"'+kid1+'"}', callback, function(response) {
            checkResponseMimeType(response);
            checkEqual('HTTP status code', response.statusCode, 200);
            var key = JSON.parse(response.body);
            checkEqualNoCase('KID value', key.kid, kid1);
            checkEqualNoCase('Key value', key.k, keyTable[kid1]);
        });
    });

var test6 = makeTest(
    'post with a body specifying some fields except for the key value',
    function(callback) {
        callApi('/keys?kek='+kek1, 'POST', '{"kid":"'+kid2+'", "info":"blabla", "contentId":"foobar", "kekId":"kek1"}', callback, function(response) {
            checkResponseMimeType(response);
            checkEqual('HTTP status code', response.statusCode, 201);
            if (!response.headers.location) {
                throw new Error('Location header is missing');
            }
            var key = JSON.parse(response.body);
            checkEqual('KID value', kid2, key.kid);
            keyTable[key.kid] = key.k;
        });
    });

var test7 = makeTest(
    'post with a body specifying just the key (non encrypted)',
    function(callback) {
        callApi('/keys?kek='+kek1, 'POST', '{"k":"'+key1+'"}', callback, function(response) {
            checkResponseMimeType(response);
            checkEqual('HTTP status code', response.statusCode, 201);
            if (!response.headers.location) {
                throw new Error('Location header is missing');
            }
        });
    });

var test8 = makeTest(
    'post with a body specifying just the key (non encrypted) and the kid',
    function(callback) {
        callApi('/keys?kek='+kek1, 'POST', '{"kid":"'+kid3+'", "k":"'+key1+'"}', callback, function(response) {
            checkResponseMimeType(response);
            checkEqual('HTTP status code', response.statusCode, 201);
            if (!response.headers.location) {
                throw new Error('Location header is missing');
            }
            var key = JSON.parse(response.body);
            checkEqual('KID value', kid3, key.kid);
            keyTable[key.kid] = key.k;
        });
    });

var test9 = makeTest(
    'get a key with a correct kek',
    function(callback) {
        callApi('/keys/'+kid3+'?kek='+kek1, 'GET', null, callback, function(response) {
            checkResponseMimeType(response);
            checkEqual('HTTP status code', response.statusCode, 200);
            var key = JSON.parse(response.body);
            checkEqualNoCase('Key value', key.k, key1);
        });
    });

var test10 = makeTest(
    'get a key value with a correct kek',
    function(callback) {
        callApi('/keys/'+kid3+'/value?kek='+kek1, 'GET', null, callback, function(response) {
            checkEqual('Key mime type', response.headers['content-type'], 'text/plain');
            checkEqual('HTTP status code', response.statusCode, 200);
            checkEqualNoCase('Key value', response.body, key1);
        });
    });

var test11 = makeTest(
    'get a key value with an incorrect kek',
    function(callback) {
        callApi('/keys/'+kid3+'/value?kek='+kek2, 'GET', null, callback, function(response) {
            checkResponseMimeType(response);
            checkEqual('HTTP status code', response.statusCode, 400);
        });
    });

var test12 = makeTest(
    'post with a body specifying a KID in ^string form',
    function(callback) {
        callApi('/keys?kek='+kek1, 'POST', '{"kid":"^kid1"}', callback, function(response) {
            checkResponseMimeType(response);
            checkEqual('HTTP status code', response.statusCode, 201);
            if (!response.headers.location) {
                throw new Error('Location header is missing');
            }
            var key = JSON.parse(response.body);
            checkEqualNoCase('KID value', kid1_hash, key.kid);
            keyTable[key.kid] = key.k;
        });
    });

var test13 = makeTest(
    'get multiple keys',
    function(callback) {
        callApi('/keys/'+[kid1, kid2, kid3].join(',')+'?kek='+kek1, 'GET', null, callback, function(response) {
            checkResponseMimeType(response);
            checkEqual('HTTP status code', response.statusCode, 200);
            var keys = JSON.parse(response.body);
            checkEqual('Key count', keys.length, 3);
            checkEqualNoCase('KID 1', keys[0].kid, kid1);
            checkEqualNoCase('KID 2', keys[1].kid, kid2);
            checkEqualNoCase('KID 3', keys[2].kid, kid3);
            checkEqualNoCase('Key 1', keys[0].k, keyTable[kid1]);
            checkEqualNoCase('Key 2', keys[1].k, keyTable[kid2]);
            checkEqualNoCase('Key 3', keys[2].k, keyTable[kid3]);
        });
    });

var test14 = makeTest(
    'get multiple key values',
    function(callback) {
        callApi('/keys/'+[kid1, kid2, kid3].join(',')+'/value?kek='+kek1, 'GET', null, callback, function(response) {
            checkEqual('Key mime type', response.headers['content-type'], 'text/plain');
            checkEqual('HTTP status code', response.statusCode, 200);
            checkEqual('Body length', response.body.length, 3*32+2);
            checkEqualNoCase('Key values', response.body, [keyTable[kid1], keyTable[kid2], keyTable[kid3]].join(','));
        });
    });

var test15 = makeTest(
    'get multiple key values in a different order',
    function(callback) {
        callApi('/keys/'+[kid3, kid2, kid1].join(',')+'/value?kek='+kek1, 'GET', null, callback, function(response) {
            checkEqual('Key mime type', response.headers['content-type'], 'text/plain');
            checkEqual('HTTP status code', response.statusCode, 200);
            checkEqual('Body length', response.body.length, 3*32+2);
            checkEqualNoCase('Key values', response.body, [keyTable[kid3], keyTable[kid2], keyTable[kid1]].join(','));
        });
    });

var test16 = makeTest(
    'put a key that does not already exist',
    function(callback) {
        callApi('/keys/'+kid4, 'PUT', '{"ek":"'+wrapped_key2+'"}', callback, function(response) {
            checkEqual('HTTP status code', response.statusCode, 404);
        });
    });

var test17 = makeTest(
    'create a new key in an encrypted form',
    function(callback) {
        callApi('/keys', 'POST', '{"kid":"'+kid4+'", "ek":"'+wrapped_key2+'"}', callback, function(response) {
            checkEqual('HTTP status code', response.statusCode, 201);
            checkResponseMimeType(response);
            keyTable[kid4] = key2;
        });
    });

var test18 = makeTest(
    'get a key in an encrypted form',
    function(callback) {
        callApi('/keys/'+kid4, 'GET', null, callback, function(response) {
            checkEqual('HTTP status code', response.statusCode, 200);
            checkResponseMimeType(response);
            var keys = JSON.parse(response.body);
            checkEqualNoCase('Encrypted key', keys.ek, wrapped_key2);
        });
    });

var test19 = makeTest(
    'retrieve a key that was put in an encrypted form, decrypted',
    function(callback) {
        callApi('/keys/'+kid4+'/value?kek='+kek3, 'GET', null, callback, function(response) {
            checkEqual('Key mime type', response.headers['content-type'], 'text/plain');
            checkEqual('HTTP status code', response.statusCode, 200);
            var keys = JSON.parse(response.body);
            checkEqualNoCase('Key', response.body, key2);
        });
    });

var test20 = makeTest(
    'change a key that already exists',
    function(callback) {
        callApi('/keys/'+kid4, 'PUT', '{"kekId":"blabla", "info":"info1234"}', callback, function(response) {
            checkEqual('HTTP status code', response.statusCode, 200);
        });
    });

var test21 = makeTest(
    'check that the key was updated in the previous step',
    function(callback) {
        callApi('/keys/'+kid4, 'GET', null, callback, function(response) {
            checkEqual('HTTP status code', response.statusCode, 200);
            checkResponseMimeType(response);
            var keys = JSON.parse(response.body);
            checkEqual('kekId', keys.kekId, "blabla");
        });
    });

var test22 = makeTest(
    'change a key that already exists, other field',
    function(callback) {
        callApi('/keys/'+kid4, 'PUT', '{"contentId":"x1234yyu"}', callback, function(response) {
            checkEqual('HTTP status code', response.statusCode, 200);
        });
    });

var test23 = makeTest(
    'check that the key was correctly updated in the previous step',
    function(callback) {
        callApi('/keys/'+kid4, 'GET', null, callback, function(response) {
            checkEqual('HTTP status code', response.statusCode, 200);
            checkResponseMimeType(response);
            var keys = JSON.parse(response.body);
            checkEqual('kekId', keys.kekId, "blabla");
            checkEqual('contentId', keys.contentId, "x1234yyu");
            checkEqual('info', keys.info, "info1234");
        });
    });

var test24 = makeTest(
    'check that the keycount is correct',
    function(callback) {
        callApi('/keycount', 'GET', null, callback, function(response) {
            checkEqual('HTTP status code', response.statusCode, 200);
            checkResponseMimeType(response);
            var keyCount = JSON.parse(response.body);
            checkEqual('keyCount', keyCount.keyCount, 8);
        });
    });

async.series([
    test1, test2, test3, test4, test5, test6, test7, test8, test9, test10, test11, test12, test13, test14, test15, test16, test17, test18, test19, test20, test21, test22, test23, test24
])