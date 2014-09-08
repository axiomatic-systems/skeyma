var crypto = require('crypto');

exports.wrapKey = function(key, kek) {
    if (typeof key == 'string') {
        key = new Buffer(key, 'hex');
    }
    if (typeof kek == 'string') {
        kek = new Buffer(kek, 'hex');
    }
    if ((key.length % 8) || (kek.length % 8)) return;

    // create a cipher
    cipher = crypto.createCipheriv('aes-128-ecb', kek, '');

    // Inputs:      Plaintext, n 64-bit values {P1, P2, ..., Pn}, and
    // Key, K (the KEK).
    // Outputs:     Ciphertext, (n+1) 64-bit values {C0, C1, ..., Cn}.
    var n = key.length/8;
    if (n < 1) return;

    // 1) Initialize variables.
    //
    //    Set A = IV, an initial value (see 2.2.3)
    //      For i = 1 to n
    //      R[i] = P[i]
    var A = new Buffer('A6A6A6A6A6A6A6A6', 'hex');
    var R = [A];
    for (var i=1; i<=n; i++) {
        R[i] = new Buffer(8);
        key.copy(R[i], 0, (i-1)*8, i*8);
    }

    // 2) Calculate intermediate values.
    //
    //    For j = 0 to 5
    //      For i=1 to n
    //        B = AES(K, A | R[i])
    //        A = MSB(64, B) ^ t where t = (n*j)+i
    //        R[i] = LSB(64, B)
    for (var j=0; j<=5; j++) {
        for (var i=1; i<=n; i++) {
            var block = Buffer.concat([A, R[i]]);
            var B = cipher.update(block);
            B.copy(A, 0, 0, 8);
            A[7] ^= (n*j)+i;
            B.copy(R[i], 0, 8, 16);
        }
    }

    // 3) Output the results.
    //
    //    Set C[0] = A
    //    For i = 1 to n
    //      C[i] = R[i]
    return Buffer.concat(R);
}

exports.unwrapKey = function(key, kek) {
    if (typeof key == 'string') {
        key = new Buffer(key, 'hex');
    }
    if (typeof kek == 'string') {
        kek = new Buffer(kek, 'hex');
    }
    if ((key.length % 8) || (kek.length % 8)) return;

    // create a cipher
    decipher = crypto.createDecipheriv('aes-128-ecb', kek, '');
    decipher.setAutoPadding(false);

    // Inputs:  Ciphertext, (n+1) 64-bit values {C0, C1, ..., Cn}, and
    // Key, K (the KEK).
    // Outputs: Plaintext, n 64-bit values {P0, P1, K, Pn}.
    var n = key.length/8 - 1;
    if (n < 1) return;

    // 1) Initialize variables.
    //
    //    Set A = C[0]
    //    For i = 1 to n
    //      R[i] = C[i]
    var A = new Buffer(8);
    key.copy(A, 0, 0, 8);
    var R = [new Buffer(0)];
    for (var i=1; i<=n; i++) {
        R[i] = new Buffer(8);
        key.copy(R[i], 0, i*8, (i+1)*8);
    }

    // 2) Compute intermediate values.
    //
    //    For j = 5 to 0
    //     For i = n to 1
    //       B = AES-1(K, (A ^ t) | R[i]) where t = n*j+i
    //       A = MSB(64, B)
    //       R[i] = LSB(64, B)
    for (var j=5; j>=0; j--) {
        for (var i=n; i>=1; i--) {
            A[7] ^= (n*j)+i;
            var block = Buffer.concat([A, R[i]]);
            var B = decipher.update(block);
            B.copy(A, 0, 0, 8);
            B.copy(R[i], 0, 8, 16);
        }
    }

    // 3) Output results.
    //
    //    If A is an appropriate initial value (see 2.2.3),
    //    Then
    //      For i = 1 to n
    //        P[i] = R[i]
    //    Else
    //      Return an error
    var ivIsValid = true; // compare in constant time
    for (var i=0; i<8; i++) {
        if (A[i] != 0xA6) {
            ivIsValid = false;
        }
    }
    if (!ivIsValid) return undefined;
    return Buffer.concat(R);
}
