CREATE TABLE Keys ( 
  kid char(32) UNIQUE,
  ek char(32) NOT NULL,
  kekId varchar(64),
  info blob,
  contentId blob,
  lastUpdate integer,
  expiration integer,
  PRIMARY KEY(kid) 
);
