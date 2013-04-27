var express = require('express');
var http = require('http');
var path = require('path');
var routes = require('./routes');
var app = express();

app.configure(function() {
  app.set("port", process.env.PORT || 8083);
  app.set("views", __dirname + "/views");
  app.set("view engine", "jade");
  app.use(express.logger("dev"));
  app.use(express.cookieParser('tweetstatsdotorg'));
  app.use(express.cookieSession());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, "../client-dist")));
});

app.configure("development", function(){
  app.use(express.errorHandler());
});

routes(app);

module.exports = http.createServer(app).listen(app.get("port"), function(){
  console.log("Express server listening on port " + app.get("port"));
});
