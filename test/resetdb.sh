rm keys.db
sqlite3 keys.db < initdb.sql
sqlite3 keys.db < testdata.sql
