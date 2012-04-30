var crypto = require('crypto'),
    List,
    ListItem,
    User;

function defineModels(mongoose, fn) {
  var Schema = mongoose.Schema,
      ObjectId = Schema.ObjectId;

  function validatePresenceOf(value) {
    return value && value.length;
  }

  /**
    * Model: List
    */

  ListItem = new Schema({
    text: String,
    completed: { type: Boolean, default: false }
  }, { strict: true });


  List = new Schema({
    title: { type: String, validate: [validatePresenceOf, 'List title required.'], required: true },
    user_ids: { type: [ObjectId], index: true },
    items: { type: [ListItem], index: true },
    invited_emails: { type: [String], index: true }
  }, { strict: true });

  List.statics.findAndModify = function (query, sort, doc, options, callback) {
    return this.collection.findAndModify(query, sort, doc, options, callback);
  };

  List.method('add_member', function(user) {
    this.user_ids.addToSet(user._id);
  });

  List.method('remove_member', function(user) {
    this.user_ids.pull(user._id);
  });

  List.method('invite', function(email) {
    // TODO - Send email invitation
    this.invited_emails.addToSet(email.toLowerCase());
    return this.save(function (err) {
      return !err;
    });
  });

  List.method('accept_invite', function(user) {
    this.invited_emails.pull(user.email);
    this.user_ids.addToSet(user._id);
    this.save();
  });

  List.method('decline_invite', function(user) {
    this.invited_emails.pull(user.email);
    this.save();
  });

  /**
    * Model: User
    */
  User = new Schema({
    'email': { type: String, validate: [validatePresenceOf, 'an email is required'], index: { unique: true } },
    'hashed_password': String,
    'salt': String,
    'access_token' : { type: String, index : {unique : true} }
  }, { strict: true });

  User.virtual('id')
    .get(function() {
      return this._id.toHexString();
    });

  User.virtual('password')
    .set(function(password) {
      this._password = password;
      this.salt = this.makeSalt();
      this.hashed_password = this.encryptPassword(password);
      this.access_token = crypto.createHmac('sha1', this.salt).update(this.makeSalt()).digest('hex');
    })
    .get(function() { return this._password; });

  User.method('authenticate', function(plainText) {
    return this.encryptPassword(plainText) === this.hashed_password;
  });

  User.method('can_add_list', function() {
    return true;
  });
  
  User.method('makeSalt', function() {
    return Math.round((new Date().valueOf() * Math.random())) + '';
  });

  User.method('encryptPassword', function(password) {
    return crypto.createHmac('sha1', this.salt).update(password).digest('hex');
  });

  User.pre('save', function(next) {
    if (!validatePresenceOf(this.password)) {
      next(new Error('Invalid password'));
    } else {
      next();
    }
    this.email = this.email.toLowerCase();
  });

  mongoose.model('List', List);
  mongoose.model('User', User);
  mongoose.model('ListItem', ListItem);

  fn();
}

exports.defineModels = defineModels; 
