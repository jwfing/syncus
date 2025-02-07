'use strict'

const express = require('express')
const domain = require('domain');
const cookieSession = require('cookie-session')
const moment = require('moment-timezone');
const timeout = require('connect-timeout')
const path = require('path')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const flash = require('./flash');
const AV = require('leanengine')

// Loads cloud function definitions.
// You can split them into several files, but don't forget to load them into the main file.
require('./cloud')

const app = express()

// Configures template engine.
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

// Configures default timeout.
app.use(timeout('15s'))

// Loads LeanEngine middleware.
app.use(AV.express())

app.enable('trust proxy')
// Uncomment the following line to redirect all HTTP requests to HTTPS.
// app.use(AV.Cloud.HttpsRedirect())

app.use(express.static('public'))

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(cookieSession({
  name: 'session',
  keys: ['foo', 'bar']
}))

app.use(AV.Cloud.CookieSession({ secret: '05b88fe4d66e1e6a80f557186d055949', name:"leanapp.syncus", maxAge: 3600000*24*7, fetchUser: false }));
app.use(flash());
app.use(checkAuth);

function checkAuth(req, res, next) {
  if (req.path === '/login' ||
      req.path === '/register' ||
      req.path === '/badluck' ||
      req.path.search('/js') === 0 ||
      req.path.search('/stylesheets') === 0) {
    next();
  } else if (req.cookies.currentUserId && req.cookies.currentUserId !== "") {
    next();
  } else {
    res.redirect('/login');
  }
}

// 未处理异常捕获 middleware
app.use(function(req, res, next) {
  var d = null;
  if (process.domain) {
    d = process.domain;
  } else {
    d = domain.create();
  }
  d.add(req);
  d.add(res);
  d.on('error', function(err) {
    console.error('uncaughtException url=%s, msg=%s', req.url, err.stack || err.message || err);
    if(!res.finished) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=UTF-8');
      res.end('uncaughtException');
    }
  });
  d.run(next);
});

app.get('/', (req, res) => {
  res.redirect('/login');
})

app.post('/login', function(req, res, next) {
  AV.User.logIn(req.body.username, req.body.password).then(function(user) {
    res.cookie('syncMail', req.body.username);
    res.cookie('currentUserId', user.id);
    res.redirect('/todos');
  }).catch(function(error) {
    console.log('[ERROR] /login failed: %j', error.message);
    res.cookie('syncMail', "")
    res.cookie('currentUserId', "");
    req.flash('errors', error.message);
    res.redirect('/login');
  });
});

app.get('/login', function(req, res, next) {
  res.render('login', {
    errors: req.flash('errors'),
    info: req.flash('info')
  });
});

app.post('/logout', function(req, res, next) {
  req.session = null;
  res.cookie('syncMail', "", {maxAge:60*1000*24*7})
  res.cookie('currentUserId', "", {maxAge:60*1000*24*7})
  AV.User.logOut();
  req._avos_session = null;
  res.redirect('/login');
});

app.get('/register', function(req, res, next) {
  res.render('register', {errors: req.flash('errors')});
});

app.post('/register', function(req, res, next) {
  if (req.body.password !== req.body.repeat_password) {
    req.flash('errors', '两次密码输入不一致！');
    res.redirect('/register');
    return;
  }
  if (req.body.password.length < 6) {
    req.flash('errors', '密码至少要六位！');
    res.redirect('/register');
    return;
  }

  var user = new AV.User();
  user.setUsername(req.body.username);
  user.setEmail(req.body.username);
  user.setPassword(req.body.password);

  user.signUp().then(function(user) {
    res.redirect('/login');
  }).catch(function(error) {
    console.log('[ERROR] /register failed: %j', error.message);
    req.flash('error', error.message);
    res.redirect('/register');
  });
});

app.post('/badluck', function( req, res ){
  var username = req.body.username;
  AV.User.requestPasswordReset( username).then(function() {
    req.flash('info','密码重设成功，请去邮箱 ' + username + ' 重设密码');
    res.redirect('/login');
  }).catch(function(error) {
    console.log( '[ERROR] /badluck failed: ' + error.message);
    req.flash('errors','重设密码失败，用户名' + username + '是正确的吗？');
    res.redirect('/login');
  });
})

// You can put routings in multiple files according to their categories.
app.use('/todos', require('./routes/todos'))

app.use((req, res, next) => {
  // If there is no routing answering, throw a 404 exception to exception handlers.
  if (!res.headersSent) {
    const err = new Error('Not Found')
    err.status = 404
    next(err)
  }
})

// error handler
app.use((err, req, res, next) => {
  if (req.timedout && req.headers.upgrade === 'websocket') {
    // Ignores websocket timeout.
    return
  }

  const statusCode = err.status || 500
  if (statusCode === 500) {
    console.error(err.stack || err)
  }
  if (req.timedout) {
    console.error('Request timeout: url=%s, timeout=%d, please check whether its execution time is too long, or the response callback is invalid.', req.originalUrl, err.timeout)
  }
  res.status(statusCode)
  // Do not output exception details by default.
  let error = {}
  if (app.get('env') === 'development') {
    // Displays exception stack on page if running in the development enviroment.
    error = err
  }
  res.render('error', {
    message: err.message,
    error: error
  })
})

module.exports = app
