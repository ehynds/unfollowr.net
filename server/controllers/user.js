/*
 * User management
 */

module.exports.login = function(req, res) {
  res.render('login');
};

module.exports.logout = function(req, res) {
  // clearCache(req.session.user_id);
  req.session = null;
  res.redirect('/');
};
