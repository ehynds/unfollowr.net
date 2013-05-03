var controllers = require("../controllers");
var home = controllers.home;
var user = controllers.user;
var twitter = controllers.twitter;

// require twitter auth middleware
function restrict(req, res, next) {
  console.log('restrict', req.session);
  return req.session.oauthAccessToken == null ?
    next(new Error('You must be logged into Twitter first')) :
    next();
}

module.exports = function(app) {
  // Home page
  app.get('/', home.index);

  // User
  app.get('/login', user.login);
  app.get('/logout', user.logout);

  // Twitter
  app.get('/twitter/connect', twitter.connect);
  app.get('/twitter/callback', twitter.callback);
  app.get('/twitter/unfollow/:screen_name', restrict, twitter.unfollow);
  app.get('/twitter/get', restrict, twitter.get);
};
