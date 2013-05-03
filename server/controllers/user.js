/*
 * User management
 */

var User = require('../models').User;

module.exports.login = function(req, res) {
  res.render('login');
};

module.exports.logout = function(req, res) {
  new User(req.session.user_id).destroy();
  req.session = null;
  res.redirect('/');
};
