/** routes.js
  */

var start = require('./routes/index');
var lists = require('./routes/lists');
var users = require('./routes/users');

module.exports = function(app) {

  app.get('/', start.index);

  /* users */
  // app.post('/v0.1/users', users.create);
  // app.put('/v0.1/users/:user_id', ensureAuthenticated, users.update);

  /* lists */
  app.get('/v0.1/lists', loadUser, lists.index);
  app.post('/v0.1/lists', loadUser, lists.create)
  app.get('/v0.1/lists/:list_id', loadUser, lists.show);
  // app.put('/v0.1/lists/:list_id'), ensureAuthenticated, lists.update);
  // app.del('/v0.1/lists/:list_id'), ensureAuthenticated, lists.destroy);
}