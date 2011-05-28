var express = require('express'),
    sys = require('sys'),
    oauth = require('oauth'),
    http = require('http'),
    cradle = require('cradle'),

    // twitter client/consumer secrets
    twitterauth = require('../twitterauth'),

    // futures stuff
    PIO = require('promised-io/promise'),
    Deferred = PIO.Deferred,
    when = PIO.when,

    // db/server
    db = new(cradle.Connection)().database('tweetstats'),
    app = express.createServer(),

    // define some "constants" we'll reuse
    MONTHS = { Jan: 01, Feb: 02, Mar: 03, Apr: 04, May: 05, Jun: 06, Jul: 07, Aug: 08, Sep: 09, Oct: 10, Nov: 11, Dec: 12 },
    ONE_DAY = 1000 * 60 * 60 * 24,
    NOW = +new Date;

app.configure(function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  app.use(express.logger());
  app.use(express.cookieParser());
  app.use(express.session({ secret:'tweetstatsdotorg' }));
  app.use(express.static(__dirname + '/public'));
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.set('view options', {
    open: '{{',
      close: '}}'
  });
});

app.dynamicHelpers({
  session: function(req, res){
    return req.session;
  }
});

function consumer() {
  return new oauth.OAuth(
    "https://twitter.com/oauth/request_token",
    "https://twitter.com/oauth/access_token", 
    twitterauth.key, // consumer key
    twitterauth.secret, // consumer secret
    "1.0A",
    "http://www.tweetstats.org/twitter/callback",
    // "http://localhost:8080/twitter/callback",
    "HMAC-SHA1"
  );
}

// require twitter auth middleware
function restrict( req, res, next ){
  return !req.session.oauthAccessToken
  ? next(new Error('You must be logged into Twitter first'))
  : next();
}

// calculates the difference between two dates.
function daydiff( date ){
  var parts = date.split(' '),
      ts = +new Date(parts[5], MONTHS[parts[1]]-1, parts[2]);

  return {
    days: Math.floor(Math.abs((NOW-ts) / ONE_DAY)),
    ts: ts
  }
}

// quick util function for querying twitter
function query( url, req, callback ){
  consumer().getProtectedResource(
    url, "POST", req.session.oauthAccessToken, req.session.oauthAccessTokenSecret,
    callback
  );
}

// home page
app.get('/', function(req, res){
  if( !req.session.oauthAccessToken ){
    res.render('login', {
      locals: { page: 'login' }
    });

    return;
  }

  res.render('index', {
    locals: { page: 'index' }
  });
});

app.get('/logout/?', restrict, function( req, res ){
  var user_id = req.session.user_id;

  req.session.destroy(function(){
    db.remove( ''+user_id, function(){
      console.log('user removed', arguments)
    });

    res.redirect('/');
  });
});

app.get('/twitter/connect/?', function(req, res){
  consumer().getOAuthRequestToken(function(error, oauthToken, oauthTokenSecret, results){
    if (error){
      console.log("Error getting OAuth request token : " + sys.inspect(error), 500);
      res.redirect('/twitter/connect');
    } else {
      req.session.oauthRequestToken = oauthToken;
      req.session.oauthRequestTokenSecret = oauthTokenSecret;
      res.redirect("https://twitter.com/oauth/authorize?oauth_token="+req.session.oauthRequestToken);      
    }
  });
});

app.get('/twitter/callback/?', function(req, res){
  sys.puts(">>"+req.session.oauthRequestToken);
  sys.puts(">>"+req.session.oauthRequestTokenSecret);
  sys.puts(">>"+req.query.oauth_verifier);

  consumer().getOAuthAccessToken(req.session.oauthRequestToken, req.session.oauthRequestTokenSecret, req.query.oauth_verifier, function(error, oauthAccessToken, oauthAccessTokenSecret, results) {
    if (error) {
      // TODO: figure out why the hell this is thrown when the first user connects,
      // but never afterwards.
      res.redirect('/twitter/connect');
      // res.send("Error getting OAuth access token : " + sys.inspect(error) + "["+oauthAccessToken+"]"+ "["+oauthAccessTokenSecret+"]"+ "["+sys.inspect(results)+"]", 500);
    } else {
      req.session.oauthAccessToken = oauthAccessToken;
      req.session.oauthAccessTokenSecret = oauthAccessTokenSecret;

      consumer().get("http://twitter.com/account/verify_credentials.json", req.session.oauthAccessToken, req.session.oauthAccessTokenSecret, function (error, data, response) {
        data = JSON.parse(data);

        if (error) {
          res.send("Error getting twitter screen name : " + sys.inspect(error), 500);
        } else {
          req.session.handle = data["screen_name"];
          req.session.user_id = data["id"];
          res.redirect('/');
        }
      });
    }
  });
});

app.get('/twitter/unfollow/:screen_name', restrict, function( req, res ){
  query('http://api.twitter.com/1/friendships/destroy.json?screen_name=' + req.params.screen_name, req, function( error, data ){
    res.send(JSON.stringify( error && { "statusCode":error.statusCode } || true ));

    var user_id = ''+req.session.user_id;

    if( !error ){
      db.get( user_id, function( error, resp ){
        var data = resp.data,
            sn = req.params.screen_name;

        data.forEach(function( friend, i ){
          if( friend.sn === sn ){
            data.splice( i, 1 );
            return false;
          }
        });

        db.save( user_id, data );
      });
    }
  });
});

app.get('/twitter/get/:limit?', restrict, function( req, res ){
  var user_id = req.session.user_id;

  // this function either grabs the user's data from the cache (couchDB) if
  // it exists, or otherwise query's the twitter API for data
  function getData(){
    var dfd = new Deferred();
    
    db.get(user_id, function( error, data ){
      if( data ){
        console.log('using data from cache', data.data.length);
        dfd.resolve( data.data );
      } else {
        query("http://api.twitter.com/1/friends/ids.json?user_id=" + user_id, req, function( error, friends ){
          if( error ){
            res.send(JSON.stringify(error));
            return;
          }
        
          friends = JSON.parse(friends);
          
          var limit = req.params.limit,
              num_friends = friends.length,
              ret = [], chunk;
          
          // loop through all friends, altering the array in the process
          while( friends.length && (chunk = friends.splice(0, 100)) ){
            query('http://api.twitter.com/1/users/lookup.json?user_id=' + chunk.join(), function( error, frienddata ){
              if( error ){
                res.send(JSON.stringify(error));
                return;
              }
              
              frienddata = JSON.parse( frienddata );
              
              var len = frienddata.length,
                  friend, tweets_day, total_tweets, day_diff, last_status;
              
              // for each friend in this chunk, push some key deets onto another array
              while( len-- ){
                friend = frienddata[len];
                total_tweets = +friend.statuses_count;
                day_diff = daydiff( friend.created_at );
                tweets_day = +(total_tweets/day_diff.days).toFixed(3);
                
                if( friend.status ){
                  last_status = daydiff( friend.status.created_at );
                }
                
                // keys are 1-2 letters to reduce the number of bytes
                // sent to the user. this matters when the user has a 
                // ton of friends.
                ret[ ret.length ] = {
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
            
              // done chunking?
              if( ret.length === num_friends ){

                // sort on the lowest tweet count
                ret.sort(function( a, b ){
                  return a.tpd < b.tpd ? -1 : a.tpd > b.tpd ? 1 : 0;
                });
                
                // cache
                db.save( ''+user_id, { data:ret });
                
                // resolve promise
                dfd.resolve( ret );
              }
            });
          }
        });
      }
    });

    return dfd.promise;
  }

  // get data & send it on down
  when( getData() ).then(function( data ){
    res.send(JSON.stringify(data));
  });
});

app.listen(8080);
