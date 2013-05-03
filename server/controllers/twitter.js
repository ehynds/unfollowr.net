var sys = require('sys');
var User = require('../models').User;

// Index, grabs all the data used to render the table
module.exports.get = function(req, res) {
  var user = new User(req.session.user_id);

  user.get(function(err, data) {
    if(err) {
      console.log(err);
      return;
    }

    res.send(JSON.stringify(data));
  });
};

// Connects to twitter; starts the oauth process
module.exports.connect = function(req, res) {
  User.consumer().getOAuthRequestToken(function(err, oauthToken, oauthTokenSecret, results) {
    if(err) {
      console.error('Error getting OAuth request token:', sys.inspect(err), 500);
      res.redirect('/twitter/connect');
      return;
    }

    req.session.oauthRequestToken = oauthToken;
    req.session.oauthRequestTokenSecret = oauthTokenSecret;
    res.redirect('https://api.twitter.com/oauth/authorize?oauth_token=' + req.session.oauthRequestToken);
  });
};

// Where twitter sends us back to after authenticating
module.exports.callback = function(req, res) {
  User.consumer().getOAuthAccessToken(
    req.session.oauthRequestToken,
    req.session.oauthRequestTokenSecret,
    req.query.oauth_verifier,
    function(err, token, secret, results) {
      if(err) {
        res.redirect('/twitter/connect');
        return;
      }

      User.oauthAccessToken = req.session.oauthAccessToken = token;
      User.oauthAccessTokenSecret = req.session.oauthAccessTokenSecret = secret;

      User.consumer().get('https://api.twitter.com/1/account/verify_credentials.json', token, secret, function(err, data, response) {
        if(err) {
          res.send('Error getting twitter screen name : ' + sys.inspect(err), 500);
          return;
        }

        data = JSON.parse(data);
        req.session.handle = data.screen_name;
        req.session.user_id = data.id;
        res.redirect('/');
      });
    }
  );
};

module.exports.unfollow = function(req, res) {
  var user = new User(req.session.user_id);

  user.unfollow(req.params.screen_name, function(err, resp) {
    if(err) {
      console.log('Error unfollowing user', err);
    }

    res.send(err || resp);
  });
};
