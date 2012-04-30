
/**
 * Module dependencies.
 */

var express = require('express'),
    mongoose = require('mongoose'),
    models = require('./models'),
    crypto = require('crypto'),
    ObjectId = mongoose.Types.ObjectId,
    db,
    ListItem,
    List,
    User,
    LoginToken;

var app = module.exports = express.createServer();


// Configuration

//
// Configure Environments
//
app.configure('development', function(){
  app.set('port', 3000);
  app.set('db-uri', 'mongodb://localhost:27017/listial');
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('staging', function(){
  app.set('db-uri', process.env.MONGOHQ_URL);
  app.set('port', process.env.PORT);
  app.use(express.errorHandler());
});

app.configure('production', function(){
  app.set('db-uri', process.env.MONGOHQ_URL);
  app.set('port', process.env.PORT);
  app.use(express.errorHandler());
});

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.logger({ format: '\x1b[1m:method\x1b[0m \x1b[33m:url\x1b[0m :response-time ms' }));
  app.use(express.static(__dirname + '/public'));
});

models.defineModels(mongoose, function() {
  app.ListItem = ListItem = mongoose.model('ListItem');
  app.List = List = mongoose.model('List');
  app.User = User = mongoose.model('User');
  db = mongoose.connect(app.set('db-uri'));
});

function apiAuth(req, res, next) {
  User.findOne({access_token : req.query.access_token}, function(err, user){
    if (err || !user) {
      /* unauthorized */
      res.writeHead(401, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      return res.end();
    }

    req.current_user = user;
    next();
  });
}

/* API Responses */
function json_response(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  
  if(typeof body !== undefined) {
    return res.end(JSON.stringify(body));
  }
  else {
    return res.end();
  }
}

function ok(res, body) {
  return json_response(res, 200, body);
}

function bad_request(res, body) {
  return json_response(res, 400, body);
}

function unauthorized(res) {
  return json_response(res, 401);
}

function forbidden(res) {
  return json_response(res, 403);
}

function not_found(res) {
  return json_response(res, 404);
}

function payment_required(res) {
  return json_response(res, 402);
}

function server_error(res) {
  return json_response(res, 500);
}

function json_error(text) {
  return JSON.stringify({ error: text });
}

/* Authentication */
app.post('/v0.1/auth', function(req, res) {
  if( req.body.email === undefined || req.body.password === undefined ) {
    /* invalid request - bad params */
    return bad_request(res, {error : "Missing Parameters"});
  }
  else {
    User.findOne({ email:req.body.email }, function(err, u){
      if (err || !u){
        /* no user found */
        return not_found(res);
      }

      if (u.authenticate(req.body.password)) {
        /* user authenticated */
        return ok(res, JSON.stringify({
          user_id : u.id,
          access_token : u.access_token,
          }));
      }
      else
      {
        /* unauthorized - incorrect password */
        return unauthorized(res);
      }
    });
  }
});

// User#create
app.post('/v0.1/users', function(req, res){

  var user = new User(req.body.user);

  user.save( function(err){
    if(err){
      if (err.errors === undefined) {
        return bad_request(res, JSON.stringify(['email not unique']));
      }
      else {
        return bad_request(res, JSON.stringify(err.errors));
      }
    }

    return ok(res,  JSON.stringify({
      user_id : user.id,
      access_token : user.access_token,
      }));
  });
});

// User#show
app.get('/v0.1/users/:id', apiAuth, function(req, res){
  var user = User.findOne({id:req.params.id}, function(err, u){
    if (!u) {
      return not_found(res);
    }

    return ok(res, JSON.stringify(user));
  });
});

// User#update
app.put('/v0.1/users/:id', apiAuth, function(req, res) {
  User.findOne({id:req.params.id}, function(err, u){
    if (err) {
      return bad_request(res, JSON.stringify(err.errors));
    }
    if (!u){
      return not_found();
    }
    else if (req.current_user !== u){
      /* Forbidden, users can only update their own information */
      return forbidden();
    }
    else
    {
      if (req.body.user !== undefined){
        if (req.body.user.email !== undefined) {
          u.email = req.body.user.email;
        }

        if (req.body.user.password !== undefined) {
          u.password = req.body.user.password;
        }
      }

      u.save( function(err){
        if(err){
          if (err.errors === undefined) {
            return bad_request(res, JSON.stringify(['email not unique']));
          }
          else {
            return bad_request(res, JSON.stringify(err.errors));
          }
        }

        /* access token gets reset if password is reset */
        return ok(res,  JSON.stringify({
          user_id : user.id,
          access_token : user.access_token,
          }));
      });
    }
  });
});

/* Lists */
/* CREATE */
app.post('/v0.1/lists', apiAuth, function(req, res){
  if (req.current_user.can_add_list()) {
    var list = new List(req.body.list);
    
    list.add_member(req.current_user);

    list.save( function(err) {
      if (err) {
        return bad_request(res, JSON.stringify(err.errors));
      }

      return ok(res, JSON.stringify(list));
    });
  }
  else {
    /* User has maxed out their list count */
    return payment_required(res);
  }
});

/* INDEX */
app.get('/v0.1/lists', apiAuth, function (req, res) {
  List.find({ $or: [{ user_ids: req.current_user.id }, 
                    { invited_emails: req.current_user.email }] }, 
            function(err, lists) {
    if (err) {
      return bad_request(res, JSON.stringify(err.errors));
    }

    return ok(res, JSON.stringify(lists));
  });
});

/* SHOW */
app.get('/v0.1/lists/:id', apiAuth, function (req, res) {
  List.findOne({ _id: req.params.id, user_ids: req.current_user._id }, function (err, list) {
    if (err) {
      return bad_request(res, JSON.stringify(err.errors));
    }

    if (!list) {
      return not_found(res);
    }

    return ok(res, JSON.stringify(list));
  });
});

/* CREATE INVITATION */
/* Note returns 404 if the email's already invited */
app.post('/v0.1/lists/:id/invitation', apiAuth, function (req, res) {
  if (!req.body.email) {
    return bad_request(res, json_error("No email provided."));
  }

  List.findOne({ _id: req.params.id, 
                 user_ids: req.current_user._id,
                 invited_emails: { $ne: req.body.email } }, function (err, list) {
    if (err) {
      console.log(err);
      return bad_request(res, JSON.stringify(err.errors));
    }

    if (!list) {
      return not_found(res);
    }

    list.invite(req.body.email);

    return ok(res, JSON.stringify({ invitation: { email: req.body.email, list_id: list._id } }));
  });
});

/* UPDATE ACCEPT/DECLINE */
app.put('/v0.1/lists/:id/invitation', apiAuth, function (req, res) {
  if (req.body.accept === undefined) {
    return bad_request(res, json_error("'accept' not provided"));
  }

  List.findOne({ _id: req.params.id, 
                 user_ids: { $ne: req.current_user._id },
                 invited_emails: req.current_user.email }, function (err, list) {
    if (err) {
      console.log(err);
      return bad_request(res, JSON.stringify(err.errors));
    }

    if (!list) {
      return not_found(res);
    }

    if( req.body.accept === true ) {
      console.log("accepting");
      list.accept_invite(req.current_user);
      return ok(res, JSON.stringify(list));
    }
    else if (req.body.accept === false ) {
      console.log("declining");
      list.decline_invite(req.current_user)
      return ok(res);
    }
    else {
      return bad_request(res, json_error("'accept' not boolean"));
    }
  });
});

/* DELETE LIST / REMOVE MEMBERSHIP */
app.del('/v0.1/lists/:id', apiAuth, function (req, res) {
  List.findOne({ _id: req.params.id, 
                 user_ids: req.current_user._id }, 
               function (err, list) {
    if (err) {
      console.log(err);
      return bad_request(res, JSON.stringify(err.errors));
    }

    if (!list) {
      return not_found(res);
    }

    list.remove_member(req.current_user);
    list.save();

    /* because this seems to be transactional, need to reload
     * the list to see if it has no more members */
    List.findOne({ _id: list._id }, function(err, list2){
      if (list2) {
        if (list2.user_ids.length === 0) {
          list2.remove();
        }
      }
    })

    return ok(res, null);
  });
});

/* LIST ITEMS */
app.post('/v0.1/lists/:list_id/items', apiAuth, function (req, res) {
  if (!req.body.item.text) {
    return bad_request(res, json_error("No text provided."));
  }

  List.findOne({ _id: req.params.list_id, 
                 user_ids: req.current_user._id }, 
               function (err, list) {
    if (err) {
      console.log(err);
      return bad_request(res, JSON.stringify(err.errors));
    }

    if (!list) {
      return not_found(res);
    }

    list.items.push(new ListItem({ text: req.body.item.text }));

    list.save( function (err) {
      if (err) {
        return server_error(res);
      }

      return ok(res, JSON.stringify({ "list.items": list.items }));
    });
  });
});

app.put('/v0.1/lists/:list_id/items/:id', apiAuth, function(req, res) {
  if (!req.body.item.completed) {
    return bad_request(res, "Invalid parameters");
  }

  List.findOne({ _id: new ObjectId(req.params.list_id), 
                 user_ids: req.current_user._id,
                 "items._id": new ObjectId(req.params.id) }, 
               function (err, list) {
    if (err) {
      return bad_request(res, JSON.stringify(err.errors));
    }

    if (!list) {
      return not_found(res);
    }

    list_item = list.items.id(req.params.id);
    list_item.completed = req.body.item.completed;
    list.markModified('items');
    list.save(function (err) {
      if (err) {
        return server_error(res);
      }

      return ok(res, JSON.stringify(list_item));
    });
  });
});

app.put('/v0.1/lists/:list_id/items', apiAuth, function (req, res) {
  if (!req.body.clear || req.body.clear !== "clear" ) {
    return bad_request(res, "Clear not specified");
  }

  List
  .findAndModify({ _id: new ObjectId(req.params.list_id), 
            user_ids: req.current_user._id },
          [],
          { $pull: { items: { completed: true } } }, 
          { 'new': true },
          function (err, list) {
            console.log("list: " + list);
            if(err)
              return server_error(res);
            if (!list)
              return not_found(res);

            return ok(res, JSON.stringify(list));
          });
});

app.listen(app.set('port'), function(){
  console.log("Express server listening on port %d in %s mode", app.set('port'), app.settings.env);
});
