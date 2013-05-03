/*global parse, query*/
var oauth = require('oauth');
var async = require('async');
var cradle = require('cradle');
var db = new(cradle.Connection)().database('tweetstats');
var env = process.env.NODE_ENV || 'development';
var twitterauth = require('../../twitterauth');

// define some "constants" we'll reuse
var MONTHS = { Jan: 01, Feb: 02, Mar: 03, Apr: 04, May: 05, Jun: 06, Jul: 07, Aug: 08, Sep: 09, Oct: 10, Nov: 11, Dec: 12 };
var ONE_DAY = 1000 * 60 * 60 * 24;

// User model constructor
function User(user_id) {
  this.user_id = '' + user_id;
  this.data = [];
}

User.prototype = {
  
  // CRUD methods
  
  get: function(callback) {
    var self = this;

    // Look for cached data
    db.get(this.user_id, function(err, doc) {
      // Return cached data if we have it
      if(doc && doc.data) {
        callback(null, doc.data);
        self.data = doc.data;
        return;
      }

      // If there isn't anything cached, go fetch it.
      query('friends/ids.json?user_id=' + self.user_id, 'get', function(err, data) {
        if(err) {
          callback(err);
          return;
        }

        data = JSON.parse(data).ids;
        var sequence = [];
        var chunk;

        // Create a batch of functions where each fetches data for 100 results
        // at a time.
        while(data.length && (chunk = data.splice(0, 100))) {
          sequence[sequence.length] = (function(user_ids) {
            return function(done) {
              self._fetchFriends(user_ids, done);
            };
          })(chunk.join());
        }

        async.parallel(sequence, function(err, results) {
          if(err) {
            callback(err);
            return;
          }

          // Concat all the results from the chunking together,
          // and parse it all.
          var flattened = parse([].concat.apply([], results));

          // Cache to DB
          self.data = flattened;
          self.save();
          callback(null, flattened);
        });
      });
    });
  },

  save: function(callback) {
    if(!callback) {
      callback = function() {};
    }

    db.save(this.user_id, {
      data: this.data
    }, callback);
  },

  destroy: function() {
    console.log('destroying model', this.user_id);

    this.get(function(err, doc) {
      if(!doc) { return; }

      try {
        db.remove(this.user_id);
      } catch(e) {
        console.log('error destroying model', e);
      }
    }.bind(this));
  },

  // Twitter

  unfollow: function(screen_name, callback) {
    query('friendships/destroy.json?screen_name=' + screen_name, function(err, data) {
      if(err) {
        callback(err);
        return;
      }

      callback(null, true);
      this._removeFriend(screen_name);
    }.bind(this));
  },

  // Internal methods

  // Fetches detailed information about each friend
  _fetchFriends: function(user_ids, callback) {
    query('users/lookup.json?user_id=' + user_ids, function(err, resp) {
      if(err) {
        callback(err);
        return;
      }

      callback(null, JSON.parse(resp));
    });
  },

  _removeFriend: function(screen_name) {
    this.get(function(err, data) {
      data.forEach(function(friend, i) {
        if(friend.sn === screen_name) {
          data.splice(i, 1);
          return false;
        }
      });

      this.data = data;
      this.save();
    }.bind(this));
  }

};

// Class methods/properties

User.oauthAccessTokenSecret = null;
User.oauthAccessToken = null;

User.consumer = function() {
  var redirect = 'http://';
  // TODO: don't hard-code this
  redirect += env === 'development' ? 'localhost:8083' : 'www.tweetstats.org';
  redirect += '/twitter/callback';

  return new oauth.OAuth(
    'https://api.twitter.com/oauth/request_token',
    'https://api.twitter.com/oauth/access_token', 
    twitterauth.key,
    twitterauth.secret,
    '1.0A',
    redirect,
    'HMAC-SHA1'
  );
};

// Queries twitter via oAuth
function query(url, type, callback) {
  // shift args
  if(!callback) {
    callback = type;
    type = "post";
  }

  console.log('Querying twitter', url, type, User.oauthAccessToken, User.oauthAccessTokenSecret);

  User.consumer().getProtectedResource(
    "https://api.twitter.com/1/" + url,
    type,
    User.oauthAccessToken,
    User.oauthAccessTokenSecret,
    callback
  );
}

// Calculates the difference in days between two dates.
function daydiff(date) {
  var parts = date.split(' ');
  var ts = +new Date(parts[5], MONTHS[parts[1]]-1, parts[2]);
  var now = (new Date()).getTime();

  return {
    days: Math.floor(Math.abs((now - ts) / ONE_DAY)),
    ts: ts
  };
}

// Prepare the payload
function parse(data) {
  var len = data.length;
  var ret = [];
  var friend, tweets_day, total_tweets, day_diff, last_status;

  while(len--) {
    friend = data[len];
    total_tweets = parseInt(friend.statuses_count, 10);
    day_diff = daydiff(friend.created_at);
    tweets_day = parseFloat(total_tweets / day_diff.days).toFixed(3);

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
      n: friend.name, // name
      dl: friend.status ? parseInt(last_status.days, 10).toFixed(0) : -1, // days since last tweet
      sn: friend.screen_name, // screen name
      tpd: tweets_day // tweets per day, bitches
    };
  }

  return ret.sort(function(a, b) {
    return a.tpd - b.tpd;
  });
}

// expose
module.exports = User;
