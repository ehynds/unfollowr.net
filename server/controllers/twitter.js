var async = require('async');
var oauth = require('oauth');
var sys = require('sys');
var twitterauth = require('../../twitterauth');
var cradle = require('cradle');
var db = new(cradle.Connection)().database('tweetstats');
var env = process.env.NODE_ENV || "development";

var user_id;
var oauthAccessToken;
var oauthAccessTokenSecret;

// define some "constants" we'll reuse
var MONTHS = { Jan: 01, Feb: 02, Mar: 03, Apr: 04, May: 05, Jun: 06, Jul: 07, Aug: 08, Sep: 09, Oct: 10, Nov: 11, Dec: 12 };
var ONE_DAY = 1000 * 60 * 60 * 24;
var NOW = (new Date()).getTime();

function consumer() {
  var redirect = "http://";
  redirect += env === "development" ? "localhost:8083" : "www.tweetstats.org";
  redirect += "/twitter/callback";

  return new oauth.OAuth(
    "https://twitter.com/oauth/request_token",
    "https://twitter.com/oauth/access_token", 
    twitterauth.key,
    twitterauth.secret,
    "1.0A",
    redirect,
    "HMAC-SHA1"
  );
}

// Calculates the difference in days between two dates.
function daydiff(date) {
  var parts = date.split(' ');
  var ts = +new Date(parts[5], MONTHS[parts[1]]-1, parts[2]);

  return {
    days: Math.floor(Math.abs((NOW-ts) / ONE_DAY)),
    ts: ts
  };
}

function clearCache(user_id) {
  db.remove('' + user_id);
}

// Helper fn for querying twitter
function query(url, type, callback) {
  // shift args
  if(!callback) {
    callback = type;
    type = "post";
  }

  consumer().getProtectedResource(
    url, type, oauthAccessToken, oauthAccessTokenSecret,
    callback
  );
}

// Fetches all friends, either from the DB cache or Twitter
function getAllFriends(callback) {
  console.log('Getting all friends for user', user_id);

  // db.get(user_id, function(err, doc) {
    // if(doc) {
      // console.log('using data from cache', doc.data.length);
      // callback(doc.data);
    // } else {
      query("http://api.twitter.com/1/friends/ids.json?user_id=" + user_id, "get", function(err, results) {
        callback(err, results);
      });
    // }
  // });
}

// Parses each friend and creates JSON to send back to the client
function parseData(data, callback) {
  var len = data.length;
  var ret = [];
  var friend, tweets_day, total_tweets, day_diff, last_status;

  while(len--) {
    friend = data[len];

    total_tweets = +friend.statuses_count;
    day_diff = daydiff(friend.created_at);
    tweets_day = +(total_tweets / day_diff.days).toFixed(3);

    if(friend.status) {
      last_status = daydiff(friend.status.created_at);
    }

    // keys are 1-2 letters to reduce the number of bytes
    // sent to the user. this matters when the user has a 
    // ton of friends.
    ret[ret.length] = {
      c: day_diff.ts, // created
      d: day_diff.days.toFixed(0), // days total on twitter
      t: total_tweets, // total tweets
      i: friend.profile_image_url, // image
      l: friend.status ? last_status.ts : '', // last tweet timestamp
      dl: friend.status ? +last_status.days.toFixed(0) : -1, // days since last tweet
      n: friend.name, // name
      sn: friend.screen_name, // screen name
      tpd: tweets_day // tweets per day, bitches
    };
  }

  callback(ret);
}


// Get more data for each friend
function getFriendData(data, callback) {
  data = JSON.parse(data).ids;

  // var len = data.length;
  // var results = [];
  var sequence = [];
  var chunk;

  // Create a batch of functions where each fetches data for 100 results
  // at a time.
  while(data.length && (chunk = data.splice(0, 100))) {
    sequence[sequence.length] = (function(userIds) {
      return function(done) {
        query('http://api.twitter.com/1/users/lookup.json?user_id=' + userIds, function(err, resp) {
          if(err) {
            done(err);
            return;
          }

          done(null, JSON.parse(resp));
        });
      };
    })(chunk.join());
  }

  async.parallel(sequence, function(err, results) {
    if(err) {
      callback(err);
      return;
    }

    var flattened = [].concat.apply([], results);
    callback(null, flattened);
  });
}

// Routes

module.exports.get = function(req, res) {
  user_id = req.session.user_id;
  oauthAccessToken = req.session.oauthAccessToken;
  oauthAccessTokenSecret = req.session.oauthAccessTokenSecret;

  async.waterfall([
    getAllFriends,
    getFriendData,
    parseData
  ], function(err, results) {
    if(err) {
      console.log('Error', err);
      res.send(JSON.stringify(err));
      return;
    }

    res.send(JSON.stringify(results));
  });
};

// Connects to twitter; starts the oauth process
module.exports.connect = function(req, res) {
  consumer().getOAuthRequestToken(function(err, oauthToken, oauthTokenSecret, results) {
    if(err) {
      console.error("Error getting OAuth request token : ", sys.inspect(err), 500);
      res.redirect('/twitter/connect');
      return;
    }

    req.session.oauthRequestToken = oauthToken;
    req.session.oauthRequestTokenSecret = oauthTokenSecret;
    res.redirect("https://twitter.com/oauth/authorize?oauth_token=" + req.session.oauthRequestToken);
  });
};

// Where twitter sends us back to after authenticating
module.exports.callback = function(req, res) {
  consumer().getOAuthAccessToken(
    req.session.oauthRequestToken,
    req.session.oauthRequestTokenSecret,
    req.query.oauth_verifier,
    function(err, oauthAccessToken, oauthAccessTokenSecret, results) {
      if(err) {
        res.redirect('/twitter/connect');
        return;
      }

      req.session.oauthAccessToken = oauthAccessToken;
      req.session.oauthAccessTokenSecret = oauthAccessTokenSecret;

      consumer().get("http://api.twitter.com/1/account/verify_credentials.json", req.session.oauthAccessToken, req.session.oauthAccessTokenSecret, function(err, data, response) {
        if(err) {
          res.send("Error getting twitter screen name : " + sys.inspect(err), 500);
          return;
        }

        data = JSON.parse(data);
        req.session.handle = data["screen_name"];
        req.session.user_id = data["id"];
        // clearCache( data["id"] );
        res.redirect('/');
      });
    }
  );
};

module.exports.unfollow = function(req, res) {
  query('http://api.twitter.com/1/friendships/destroy.json?screen_name=' + req.params.screen_name, function(err, data) {
    res.send(JSON.stringify(err && {
      statusCode: err.statusCode
    } || true ));

    var user_id = '' + req.session.user_id;

    if(err) {
      return;
    }

    db.get(user_id, function(error, resp) {
      var data = resp.data;
      var sn = req.params.screen_name;

      data.forEach(function(friend, i) {
        if(friend.sn === sn) {
          data.splice(i, 1);
          return false;
        }
      });

      db.save(user_id, data);
    });
  });
};
