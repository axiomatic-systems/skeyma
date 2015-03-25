SKM API Examples and Cookbook
=============================

Create a new Key, with a server-assigned value and KID
------------------------------------------------------

POST an empty body, or a body with an empty ``{}`` JSON Object. 
The server will create a new random key and assign it a new random KID. 

Because the server only stores encrypted keys, the ``kek`` parameter is required

  **Request**

  .. sourcecode:: http

    POST /keys?kek=000102030405060708090a0b0c0d0e0f HTTP/1.1

  **Response**

  .. sourcecode:: http

    HTTP/1.1 201 Created
    Content-Type: application/json
    Location: /keys/4e2df6b45e8257e187b2802b22ae7418

    {
      "kid":   "4e2df6b45e8257e187b2802b22ae7418",
      "k":     "a9b9033df0b9ca5447839e3d074817a0",
      "ek":    "5dbd06c0056b42fe0b8cf406679620c31bd619732730433d",
      "kekId": "#1.afe008a381bdac03b412a92d54b92ddf"
    }

Get a key by KID, with server auto-creation of the key if it does not exist
---------------------------------------------------------------------------

POST a body with a partial JSON Key Object, including a ``kid`` field.
If a Key Object with that KID already exists on the server, that object is returned, with an ``HTTP 200`` response code. If no such Key Object already exists, a new one is created, with a new random key value.

Because the server only stores encrypted keys, the ``kek`` parameter is required

  **Request**

  .. sourcecode:: http

    POST /keys?kek=000102030405060708090a0b0c0d0e0f HTTP/1.1
    Content-Type: application/json

    {
      "kid":   "4e2df6b45e8257e187b2802b22ae7418",
    }

  **Response if no key with that KID exists on the server**

  .. sourcecode:: http

    HTTP/1.1 201 Created
    Content-Type: application/json
    Location: /keys/4e2df6b45e8257e187b2802b22ae7418

    {
      "kid":   "4e2df6b45e8257e187b2802b22ae7418",
      "k":     "a9b9033df0b9ca5447839e3d074817a0",
      "ek":    "5dbd06c0056b42fe0b8cf406679620c31bd619732730433d",
      "kekId": "#1.afe008a381bdac03b412a92d54b92ddf"
    }

  **Response if a key with that KID already exists on the server**

  .. sourcecode:: http

    HTTP/1.1 200 OK
    Content-Type: application/json

    {
      "kid":   "4e2df6b45e8257e187b2802b22ae7418",
      "k":     "a9b9033df0b9ca5447839e3d074817a0",
      "ek":    "5dbd06c0056b42fe0b8cf406679620c31bd619732730433d",
      "kekId": "#1.afe008a381bdac03b412a92d54b92ddf"
    }

Using KIDs generated from strings
---------------------------------

In some cases, it may be useful to have KIDs that correspond to a well-defined scheme, so that they can follow a pattern instead of being randomly generated.

For example, let's say we are deploying a system with live TV channels for streaming. Each channel must be encrypted with a different key, and the keys must change every day. Instead of picking a random KID for each channel for each day, a simpler approach is to use a pattern where we assign a key name to each channel/day. We can represent the channel by its name and the day by the string YYYY.MM.DD. For example, the key name for channel CNN on December 18 2014 would be: CNN.2014.12.18

We can now use the ``^string`` KID syntax instead of using hex KID representations. To obtain the key for Channel CNN for December 18 2014, we would get:

.. http:get:: /keys/^CNN.2014.12.18

or, if we want the server to auto-create the key if it doesn't already exist:

.. http:post:: /keys

  .. sourcecode:: http

    Content-Type: application/json

    {
      "kid": "^CNN.2014.12.18"
    }

This is much more convenient than having to remember a different random KID for each day for each channel.

Wrapping keys client-side
-------------------------

Sometimes it may be desirable to perform key wrapping/unwrapping on the client side, instead of passing a KEK (Key Encryption Key) and ask the server to do it. For instance, the client may want to use a specific cryptographic random number generator, or may not want to pass a KEK to the server.
This, of course, requires the client to be able to perform the proper AES Key Wrap cryptographic operations.
To keep the wrapping/unwrapping entirely client-side, simply ommit the ``kek`` query parameter in requests and supply the ``ek`` value when creating the key.

  **Request**

  .. sourcecode:: http

    POST /keys HTTP/1.1
    Content-Type: application/json

    {
      "kid":   "4e2df6b45e8257e187b2802b22ae7418",
      "ek":    "5dbd06c0056b42fe0b8cf406679620c31bd619732730433d",
      "kekId": "my-kek-id-1234"
    }

  **Response**

  .. sourcecode:: http

    HTTP/1.1 201 Created
    Content-Type: application/json
    Location: /keys/4e2df6b45e8257e187b2802b22ae7418

    {
      "kid":   "4e2df6b45e8257e187b2802b22ae7418",
      "ek":    "5dbd06c0056b42fe0b8cf406679620c31bd619732730433d",
      "kekId": "my-kek-id-1234"
    }
