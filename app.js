
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes');

var app = module.exports = express.createServer();



var mongourl = process.env.MONGOHQ_URL || 'mongodb://localhost:27017/listial';

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.methodOverride());
  app.use(express.session({ secret: 'Nei3To8aEiH9Qui0' }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('staging', function(){
  app.use(express.errorHandler());
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes

app.get('/', routes.index);

app.get('/v0.1/lists', function(req, res){
  require('mongodb').connect(mongourl, function(err, conn){
    conn.collection('lists', function(err, coll){
      coll.find(function(err, cursor) {
      cursor.toArray(function(err, items) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(JSON.stringify(items));
      });
      });
    });
  });
});

app.get('/v0.1/lists/:list_id', function(req, res){
  require('mongodb').connect(mongourl, function(err, conn){
    conn.collection('lists', function(err, coll){
      coll.findOne({'_id':req.params.list_id}, function(err, document) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify(document));
      });
    });
  });

});

app.post('/v0.1/lists', function(req, res){
  require('mongodb').connect(mongourl, function(err, conn){
    conn.collection('lists', function(err, coll){
      coll.insert( req.body, {safe:true}, function(err){
        console.log("error: "+err);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify(req.body));
      });
    });
  });
});

var port = process.env.PORT || 3000;

app.listen(port, function(){
  console.log("Express server listening on port %d in %s mode", port, app.settings.env);
});
