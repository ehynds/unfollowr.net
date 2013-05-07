/*
 * Home page 
 */

module.exports.index = function(req, res) {
  if(!req.session.oauthAccessToken) {
    res.redirect('/user/login');
    return;
  }

  res.render('index', {
    user_id: req.session.user_id
  });
};
