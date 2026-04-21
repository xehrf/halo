const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 10;

const hashPassword = (plainPassword) => bcrypt.hash(plainPassword, SALT_ROUNDS);
const comparePassword = (plainPassword, hash) => bcrypt.compare(plainPassword, hash);

module.exports = {
  hashPassword,
  comparePassword,
};

